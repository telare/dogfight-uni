/**
 * Dogfight Server — Авторитетний ігровий матч (Match) на 30 Hz (Lab 05)
 *
 * Особливості:
 * 1. Fixed Tick Rate 30 Hz (dt = 1/30 = 33.33ms).
 * 2. Прецизійний таймер на базі setTimeout з абсолютною цільовою міткою часу
 *    (захист від нагромадження затримки та дрейфу setInterval).
 * 3. Вимірювання часу виконання тіку та джиттеру таймера.
 * 4. Черга вхідних команд клієнтів (inputs) та відстеження lastProcessedSeq на клієнта.
 * 5. Розсилка снапшотів через LatencyInjector у бінарному або JSON форматі.
 */

import { World, Ship, encodeSnapshot, encodeJsonSnapshot } from 'shared'
import { LatencyInjector } from './latency.js'

export class Match {
  constructor({
    room,
    tickRate = 30,
    seed = null,
    arenaWidth = 1200,
    arenaHeight = 800,
  } = {}) {
    this.room = room
    this.tickRate = tickRate
    this.tickIntervalMs = 1000 / tickRate
    this.tickDt = 1 / tickRate
    this.arenaWidth = arenaWidth
    this.arenaHeight = arenaHeight

    this.seed = seed || Date.now() & 0x7fffffff
    this.world = new World({
      width: arenaWidth,
      height: arenaHeight,
      seed: this.seed,
    })

    // Початкові астероїди
    this.world.spawnInitialAsteroids(4)

    this.tickNumber = 0
    this.running = false
    this.timerId = null
    this.nextTickTime = 0
    this.lastTickTimestamp = 0

    // Статистика тіків
    this.tickDurations = []
    this.tickJitters = []
    this.maxDurationMs = 0
    this.maxJitterMs = 0
    this.overrunCount = 0

    // Стан гравців у матчі
    this.playerShips = new Map() // playerId -> Ship
    this.pendingInputs = new Map() // playerId -> input
    this.lastProcessedSeq = new Map() // playerId -> last seq

    // Інжектор мережевої затримки
    this.latencyInjector = new LatencyInjector({
      latencyMs: 0,
      jitterMs: 0,
      dropRate: 0,
    })

    // Активний кодек розсилки: 'binary' | 'json'
    this.codec = 'binary'
  }

  start() {
    if (this.running) return
    this.running = true
    this.nextTickTime = performance.now()
    this.lastTickTimestamp = performance.now()
    this.scheduleNextTick()
  }

  stop() {
    this.running = false
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  scheduleNextTick() {
    if (!this.running) return
    this.nextTickTime += this.tickIntervalMs
    const now = performance.now()
    const delay = Math.max(0, this.nextTickTime - now)

    this.timerId = setTimeout(() => {
      this.tick()
      this.scheduleNextTick()
    }, delay)
  }

  /**
   * Додавання нового пілота та створення його корабля в авторитетному світі
   */
  addPlayer(player) {
    const safePos = this.world.findSafeSpawnPos(24)
    const ship = new Ship({
      pos: safePos,
      playerId: player.id,
      name: player.name,
      angle: -Math.PI / 2,
    })

    this.world.spawn(ship)
    this.playerShips.set(player.id, ship)
    this.lastProcessedSeq.set(player.id, 0)

    return ship
  }

  /**
   * Видалення корабля при виході гравця
   */
  removePlayer(playerId) {
    const ship = this.playerShips.get(playerId)
    if (ship) {
      this.world.despawn(ship.id)
      this.playerShips.delete(playerId)
    }
    this.pendingInputs.delete(playerId)
    this.lastProcessedSeq.delete(playerId)
  }

  /**
   * Додавання вхідної команди від гравця
   */
  queueInput(playerId, input) {
    if (!this.playerShips.has(playerId)) return
    this.pendingInputs.set(playerId, input)
    if (
      typeof input.seq === 'number' &&
      input.seq > (this.lastProcessedSeq.get(playerId) || 0)
    ) {
      this.lastProcessedSeq.set(playerId, input.seq)
    }
  }

  /**
   * Авторитетний крок симуляції (30 разів на секунду)
   */
  tick() {
    const tickStart = performance.now()
    const actualInterval = tickStart - this.lastTickTimestamp
    this.lastTickTimestamp = tickStart

    // Замір джиттеру таймера
    if (this.tickNumber > 0) {
      const jitter = Math.abs(actualInterval - this.tickIntervalMs)
      this.tickJitters.push(jitter)
      if (this.tickJitters.length > 60) this.tickJitters.shift()
      if (jitter > this.maxJitterMs) this.maxJitterMs = jitter
    }

    this.tickNumber++

    // Підготовка вхідних даних для кожного активного корабля
    const inputsMap = new Map()
    for (const [playerId, ship] of this.playerShips) {
      const input = this.pendingInputs.get(playerId)
      if (input) {
        inputsMap.set(ship.id, input)
      }
    }

    // 1. Крок симуляції авторитетного світу
    this.world.step(this.tickDt, inputsMap)

    // 2. Розсилка снапшотів усім підключеним клієнтам
    this.broadcastSnapshots()

    // 3. Замір тривалості виконання тіку
    const tickEnd = performance.now()
    const duration = tickEnd - tickStart
    this.tickDurations.push(duration)
    if (this.tickDurations.length > 60) this.tickDurations.shift()
    if (duration > this.maxDurationMs) this.maxDurationMs = duration

    if (duration > this.tickIntervalMs) {
      this.overrunCount++
    }
  }

  /**
   * Розсилка знімків із персоналізованим ackSeq для кожного гравця
   */
  broadcastSnapshots() {
    if (!this.room || this.playerShips.size === 0) return

    const now = Date.now()
    const rawSnapshot = this.world.getSnapshot(this.tickNumber, now, 0)

    for (const [playerId, playerData] of this.room.players) {
      const ws = playerData.socket
      if (!ws || ws.readyState !== 1) continue // 1 = OPEN

      const ackSeq = this.lastProcessedSeq.get(playerId) || 0
      rawSnapshot.ackSeq = ackSeq

      let payload = null
      if (this.codec === 'binary') {
        payload = encodeSnapshot(rawSnapshot)
      } else {
        payload = encodeJsonSnapshot(rawSnapshot)
      }

      this.latencyInjector.deliver(() => {
        if (ws.readyState === 1) {
          try {
            ws.send(payload)
          } catch (err) {
            console.error(
              `[Match snapshot send error ${playerId}]:`,
              err.message,
            )
          }
        }
      })
    }
  }

  /**
   * Отримання поточної діагностичної статистики тіку
   */
  getStats() {
    const avgDuration =
      this.tickDurations.length > 0
        ? this.tickDurations.reduce((a, b) => a + b, 0) /
          this.tickDurations.length
        : 0
    const avgJitter =
      this.tickJitters.length > 0
        ? this.tickJitters.reduce((a, b) => a + b, 0) / this.tickJitters.length
        : 0

    return {
      tick: this.tickNumber,
      tickRate: this.tickRate,
      targetIntervalMs: Number(this.tickIntervalMs.toFixed(2)),
      avgDurationMs: Number(avgDuration.toFixed(3)),
      maxDurationMs: Number(this.maxDurationMs.toFixed(3)),
      avgJitterMs: Number(avgJitter.toFixed(3)),
      maxJitterMs: Number(this.maxJitterMs.toFixed(3)),
      overrunCount: this.overrunCount,
      entitiesCount: this.world.size,
      playersCount: this.playerShips.size,
      codec: this.codec,
      latency: this.latencyInjector.getConfig(),
    }
  }
}
