import { logger } from './logger.ts'
import { sendMeasured, reject } from './metrics.ts'
import { config } from './config.ts'
import {
  asSeq,
  encodeSnapshot,
  jsonCodec,
  type InputFrame,
  type ShipInput,
  type Seq,
} from 'shared'
import type { Room, Player } from './rooms.ts'
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

import { World, Ship } from 'shared'
import { LatencyInjector } from './latency.ts'
import { Bot } from './bot.ts'

export class Match {
  bots = new Map<string, Bot>()
  private nextBotId = 1
  private inputsMap = new Map<number | string, ShipInput>()

  addBots(count: number) {
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 128 ||
      this.bots.size + count > 128
    )
      throw new RangeError(
        'Bot count must be 1–128, with at most 128 bots per match',
      )
    if (
      this.room &&
      this.playerShips.size + count > config.MAX_PLAYERS_PER_ROOM
    )
      throw new RangeError('Room capacity exceeded')
    for (let i = 0; i < count; i++) {
      const id = `bot-${this.nextBotId++}`
      this.addPlayer({ id, name: id })
      this.bots.set(id, new Bot())
    }
    return this.bots.size
  }
  room: Room | undefined
  timerId: ReturnType<typeof setTimeout> | null
  tickDurations: number[]
  tickJitters: number[]
  playerShips: Map<string, Ship>
  pendingInputs: Map<string, InputFrame>
  lastProcessedSeq: Map<string, Seq>

  tickRate: number
  tickIntervalMs: number
  tickDt: number
  arenaWidth: number
  arenaHeight: number
  seed: number
  world: World
  tickNumber: number
  running: boolean
  nextTickTime: number
  lastTickTimestamp: number
  maxDurationMs: number
  maxJitterMs: number
  overrunCount: number
  latencyInjector: LatencyInjector
  codec: string

  constructor({
    room,
    tickRate = 30,
    seed = null,
    arenaWidth = 1200,
    arenaHeight = 800,
  }: {
    room?: Room
    tickRate?: number
    seed?: number | null
    arenaWidth?: number
    arenaHeight?: number
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
  addPlayer(player: Pick<Player, 'id' | 'name'>) {
    const safePos = this.world.findSafeSpawnPos(24)
    const ship = new Ship({
      pos: safePos,
      playerId: player.id,
      name: player.name,
      angle: -Math.PI / 2,
    })

    this.world.spawn(ship)
    this.playerShips.set(player.id, ship)
    this.lastProcessedSeq.set(player.id, asSeq(0))

    return ship
  }

  /**
   * Видалення корабля при виході гравця
   */
  removePlayer(playerId: string) {
    this.bots.delete(playerId)
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
  queueInput(playerId: string, input: InputFrame) {
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
    const inputsMap = this.inputsMap
    inputsMap.clear()
    for (const [playerId, ship] of this.playerShips) {
      const input =
        this.bots.get(playerId)?.update(ship, this.world) ??
        this.pendingInputs.get(playerId)
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

    const binary = this.codec === 'binary' ? encodeSnapshot(rawSnapshot) : null
    for (const [playerId, playerData] of this.room.players) {
      const ws = playerData.socket
      if (!ws || ws.readyState !== 1) continue // 1 = OPEN

      if (ws.bufferedAmount > config.BUFFERED_AMOUNT_THRESHOLD) {
        reject('slow_client', playerId)
        ws.close(1008, 'Slow client')
        continue
      }
      const ackSeq = this.lastProcessedSeq.get(playerId) || 0
      const snapshot = { ...rawSnapshot, ackSeq: asSeq(ackSeq) }

      const codec = this.codec
      const payload = binary ? binary.slice(0) : jsonCodec.encode(snapshot)
      if (payload instanceof ArrayBuffer && binary) {
        new DataView(payload).setUint32(10, ackSeq, true)
      }

      this.latencyInjector.deliver(() => {
        if (ws.readyState === 1) {
          try {
            sendMeasured(ws, payload, { binary: codec === 'binary' })
          } catch (err) {
            logger.error({ event: 'match.operation' })
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
      tickP99Ms:
        [...this.tickDurations].sort((a, b) => a - b)[
          Math.max(0, Math.ceil(this.tickDurations.length * 0.99) - 1)
        ] ?? 0,
      botsCount: this.bots.size,
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
