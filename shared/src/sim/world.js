import { PRNG } from './prng.js'
import { wrap } from './arena.js'
import { resolveCollisions } from './collision.js'
import { Asteroid } from './asteroid.js'
import { Vector2 } from './vector.js'
import { Ship } from './ship.js'
import { Bullet } from './bullet.js'
import { Pickup } from './pickup.js'

/**
 * Чистий, ізольований і детермінований клас World.
 * Працює в Node.js та в браузері без DOM, Canvas чи специфічних залежностей.
 */
export class World {
  #entities = new Map()
  #listeners = new Map()
  #nextEntityId = 1

  constructor({ width = 1200, height = 800, seed = 42 } = {}) {
    this.arenaWidth = width
    this.arenaHeight = height
    this.seed = seed
    this.prng = new PRNG(seed)
    this.events = []
    this.respawnTimers = new Map() // shipId -> timer
    this.#nextEntityId = 1
  }

  getNextId() {
    return this.#nextEntityId++
  }

  get size() {
    return this.#entities.size
  }

  /**
   * Диспетчеризація подій симуляції
   */
  emit(type, detail = {}) {
    this.events.push({ type, detail })
    const cbs = this.#listeners.get(type)
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(detail)
        } catch (err) {
          console.error(`[World event error ${type}]:`, err)
        }
      }
    }
  }

  on(type, callback) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }
    this.#listeners.get(type).add(callback)
    return () => this.#listeners.get(type)?.delete(callback)
  }

  addEventListener(type, listener) {
    return this.on(type, (detail) => {
      listener({ type, detail })
    })
  }

  dispatchEvent(event) {
    this.emit(event.type, event.detail || {})
    return true
  }

  spawn(entity) {
    if (!entity) {
      throw new Error('World.spawn: Entity must be provided')
    }
    if (!entity.hasExplicitId) {
      entity.assignId?.(this.#nextEntityId++)
    }
    this.#entities.set(entity.id, entity)
    return entity
  }

  despawn(id) {
    const entity = this.#entities.get(id)
    if (entity) {
      entity.alive = false
    }
  }

  get(id) {
    return this.#entities.get(id)
  }

  has(id) {
    return this.#entities.has(id)
  }

  clear() {
    this.#entities.clear()
    this.events = []
    this.respawnTimers.clear()
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values()
  }

  *ofKind(kind) {
    for (const entity of this.#entities.values()) {
      if (entity.kind === kind) {
        yield entity
      }
    }
  }

  findSafeSpawnPos(radius = 40) {
    const margin = 100
    for (let attempts = 0; attempts < 25; attempts++) {
      const candidate = new Vector2(
        margin + this.prng.random() * (this.arenaWidth - margin * 2),
        margin + this.prng.random() * (this.arenaHeight - margin * 2),
      )

      let safe = true
      for (const asteroid of this.ofKind('asteroid')) {
        if (
          candidate.distSq(asteroid.pos) <
          (asteroid.radius + radius + 70) ** 2
        ) {
          safe = false
          break
        }
      }

      if (safe) return candidate
    }

    return new Vector2(this.arenaWidth / 2, this.arenaHeight / 2)
  }

  spawnInitialAsteroids(count = 4) {
    for (let i = 0; i < count; i++) {
      const pos = this.findSafeSpawnPos(30)
      const angle = this.prng.random() * Math.PI * 2
      const speed = 40 + this.prng.random() * 60
      this.spawn(
        new Asteroid({
          id: this.getNextId(),
          pos,
          vel: Vector2.fromAngle(angle, speed),
          tier: 2,
          rotSpeed: (this.prng.random() - 0.5) * 1.5,
        }),
      )
    }
  }

  #spawnRandomAsteroid() {
    const side = this.prng.randInt(0, 4)
    let x = 0
    let y = 0
    if (side === 0) {
      x = this.prng.random() * this.arenaWidth
      y = 0
    } else if (side === 1) {
      x = this.arenaWidth
      y = this.prng.random() * this.arenaHeight
    } else if (side === 2) {
      x = this.prng.random() * this.arenaWidth
      y = this.arenaHeight
    } else {
      x = 0
      y = this.prng.random() * this.arenaHeight
    }

    const angle = this.prng.random() * Math.PI * 2
    const speed = 40 + this.prng.random() * 60

    this.spawn(
      new Asteroid({
        id: this.getNextId(),
        pos: new Vector2(x, y),
        vel: Vector2.fromAngle(angle, speed),
        tier: 2,
        rotSpeed: (this.prng.random() - 0.5) * 1.5,
      }),
    )
  }

  /**
   * Головний крок оновлення симуляції.
   *
   * @param {number} dt - дельта часу (секунди, зазвичай 1/30)
   * @param {Map<number|string, Object>|Object} [inputsMap] - мапа вхідних даних для кораблів
   */
  step(dt = 1 / 30, inputsMap = null) {
    this.events = []

    // 1. Оновлення сутностей
    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue

      if (entity.kind === 'ship') {
        let input = null
        if (inputsMap) {
          if (inputsMap instanceof Map) {
            input =
              inputsMap.get(entity.id) ||
              inputsMap.get(entity.playerId) ||
              inputsMap.get(String(entity.id))
          } else if (typeof inputsMap === 'object') {
            input =
              inputsMap[entity.id] ||
              inputsMap[entity.playerId] ||
              inputsMap[String(entity.id)]
          }
        }
        entity.stepInput(input || {}, dt, this)
      } else {
        entity.update(dt, this)
      }

      wrap(entity, this.arenaWidth, this.arenaHeight)
    }

    // 2. Розрахунок колізій
    resolveCollisions(this)

    // 3. Sweep: видалення мертвих сутностей (крім кораблів на респауні)
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        if (entity.kind === 'ship') {
          // Запуск респауну для корабля
          if (!this.respawnTimers.has(id)) {
            this.respawnTimers.set(id, 2.0)
          }
        } else {
          this.#entities.delete(id)
        }
      }
    }

    // 4. Обробка респауну кораблів
    for (const [shipId, timer] of this.respawnTimers) {
      const remaining = timer - dt
      if (remaining <= 0) {
        this.respawnTimers.delete(shipId)
        const ship = this.#entities.get(shipId)
        if (ship && ship.kind === 'ship') {
          const safePos = this.findSafeSpawnPos(ship.radius)
          ship.respawn(safePos)
          this.emit('respawn', { shipId, pos: safePos.clone() })
        }
      } else {
        this.respawnTimers.set(shipId, remaining)
      }
    }

    // 5. Підтримка популяції астероїдів
    let asteroidCount = 0
    for (const a of this.ofKind('asteroid')) {
      if (a.alive) asteroidCount++
    }
    if (asteroidCount < 4) {
      this.#spawnRandomAsteroid()
    }
  }

  /**
   * Створення повного знімка стану для клієнтів
   */
  getSnapshot(tick = 0, serverTime = Date.now(), ackSeq = 0) {
    const entities = []
    for (const entity of this.#entities.values()) {
      if (entity.alive) {
        entities.push(entity.serialize())
      }
    }
    return {
      tick,
      serverTime,
      ackSeq,
      entities,
    }
  }

  /**
   * Відновлення стану з наданого знімка
   */
  loadSnapshot(snapshot) {
    this.#entities.clear()
    for (const data of snapshot.entities || []) {
      let entity = null
      switch (data.kind) {
        case 'ship':
          entity = Ship.fromSnapshot(data)
          break
        case 'bullet':
          entity = Bullet.fromSnapshot(data)
          break
        case 'asteroid':
          entity = Asteroid.fromSnapshot(data)
          break
        case 'pickup':
          entity = Pickup.fromSnapshot(data)
          break
        default:
          entity = null
      }
      if (entity) {
        this.#entities.set(entity.id, entity)
      }
    }
  }
}
