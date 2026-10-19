import {
  assertNever,
  asTick,
  asSeq,
  asEntityId,
  type EntityId,
  type SnapshotData,
  type SnapshotState,
} from '../protocol/protocol.ts'
import { Bus } from '../events.ts'
import type { PickupType } from './components.ts'
import type { ShipInput } from './ship.ts'
export type GameEntity = Ship | Bullet | Asteroid | Pickup
import { PRNG } from './prng.ts'
import { wrap } from './arena.ts'
import { resolveCollisions } from './collision.ts'
import { Asteroid } from './asteroid.ts'
import { Vector2 } from './vector.ts'
import { Ship } from './ship.ts'
import { Bullet } from './bullet.ts'
import { Pickup } from './pickup.ts'

export type WorldEvents = {
  hit: {
    targetKind: 'ship' | 'asteroid'
    sourceKind: 'bullet' | 'asteroid'
    pos: Vector2
    damage: number
  }
  exploded: { kind: 'ship' | 'asteroid'; pos: Vector2; tier?: 1 | 2 }
  score: { score: number; delta: number; pos: Vector2 }
  pickup: { type: PickupType; pos: Vector2 }
  fired: { kind: 'bullet'; pos: Vector2; ownerId: EntityId; isHoming: boolean }
  respawn: { shipId: EntityId; pos: Vector2 }
}
export type WorldEventType = keyof WorldEvents
export type WorldEventCallback<K extends WorldEventType = WorldEventType> = (
  detail: WorldEvents[K],
) => void

export interface WorldEvent {
  type: WorldEventType
  detail: WorldEvents[WorldEventType]
}

export interface WorldOptions {
  width?: number
  height?: number
  seed?: number
}

/**
 * Чистий, ізольований і детермінований клас World.
 * Працює в Node.js та в браузері без DOM, Canvas чи специфічних залежностей.
 */
export class World {
  #entities = new Map<EntityId, GameEntity>()
  #bus = new Bus<WorldEvents>()
  #nextEntityId = 1

  arenaWidth: number
  arenaHeight: number
  seed: number
  prng: PRNG
  events: WorldEvent[]
  respawnTimers: Map<EntityId, number>
  // Optional: server attaches playerShip reference
  playerShip?: Ship

  constructor({ width = 1200, height = 800, seed = 42 }: WorldOptions = {}) {
    this.arenaWidth = width
    this.arenaHeight = height
    this.seed = seed
    this.prng = new PRNG(seed)
    this.events = []
    this.respawnTimers = new Map()
    this.#nextEntityId = 1
  }

  getNextId(): EntityId {
    // Reuse vacant wire IDs only after wrapping; never overwrite a live entity.
    for (let attempts = 0; attempts < 0xffff; attempts++) {
      const id = asEntityId(this.#nextEntityId)
      this.#nextEntityId =
        this.#nextEntityId === 0xffff ? 1 : this.#nextEntityId + 1
      if (!this.#entities.has(id)) return id
    }
    throw new RangeError('World has no available entity IDs')
  }

  get size(): number {
    return this.#entities.size
  }

  /**
   * Диспетчеризація подій симуляції
   */
  emit<K extends WorldEventType>(type: K, detail: WorldEvents[K]): void {
    this.events.push({ type, detail })
    this.#bus.emit(type, detail)
  }

  on<K extends WorldEventType>(
    type: K,
    callback: WorldEventCallback<K>,
  ): () => void {
    return this.#bus.on(type, (detail) => {
      try {
        callback(detail)
      } catch (err: unknown) {
        console.error(`[World event error ${type}]:`, err)
      }
    })
  }

  addEventListener<K extends WorldEventType>(
    type: K,
    listener: (e: { type: K; detail: WorldEvents[K] }) => void,
  ): () => void {
    return this.on(type, (detail) => {
      listener({ type, detail })
    })
  }

  dispatchEvent<K extends WorldEventType>(event: {
    type: K
    detail: WorldEvents[K]
  }): boolean {
    this.emit(event.type, event.detail)
    return true
  }

  spawn<T extends GameEntity>(entity: T): T {
    if (!entity) {
      throw new Error('World.spawn: Entity must be provided')
    }
    if (!entity.hasExplicitId) {
      entity.assignId(this.getNextId())
    }
    const existing = this.#entities.get(entity.id)
    if (existing && existing !== entity)
      throw new Error(`Entity ID ${entity.id} is already in use`)
    this.#entities.set(entity.id, entity)
    return entity
  }

  despawn(id: EntityId): void {
    const entity = this.#entities.get(id)
    if (entity) {
      entity.alive = false
    }
  }

  get(id: EntityId): GameEntity | undefined {
    return this.#entities.get(id)
  }

  has(id: EntityId): boolean {
    return this.#entities.has(id)
  }

  clear(): void {
    this.#entities.clear()
    this.events = []
    this.respawnTimers.clear()
  }

  *[Symbol.iterator](): IterableIterator<GameEntity> {
    yield* this.#entities.values()
  }

  *ofKind(kind: string): IterableIterator<GameEntity> {
    for (const entity of this.#entities.values()) {
      if (entity.kind === kind) {
        yield entity
      }
    }
  }

  findSafeSpawnPos(radius = 40): Vector2 {
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

  spawnInitialAsteroids(count = 4): void {
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

  #spawnRandomAsteroid(): void {
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
   */
  step(
    dt = 1 / 30,
    inputsMap:
      Map<number | string, ShipInput> | Record<string, ShipInput> | null = null,
  ): void {
    this.events = []

    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue

      if (entity.kind === 'ship') {
        let input: ShipInput | null = null
        if (inputsMap) {
          if (inputsMap instanceof Map) {
            input =
              inputsMap.get(entity.id) ??
              inputsMap.get(entity.id.toString()) ??
              null
          } else {
            input = inputsMap[entity.id] ?? null
          }
        }
        entity.stepInput(input ?? {}, dt, this)
      } else {
        entity.update(dt, this)
      }

      wrap(entity, this.arenaWidth, this.arenaHeight)
    }

    resolveCollisions(this)

    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        if (entity.kind === 'ship') {
          if (!this.respawnTimers.has(id)) {
            this.respawnTimers.set(id, 2.0)
          }
        } else {
          this.#entities.delete(id)
        }
      }
    }

    for (const [shipId, timer] of this.respawnTimers) {
      const remaining = timer - dt
      if (remaining <= 0) {
        this.respawnTimers.delete(shipId)
        const ship = this.#entities.get(shipId)
        if (ship?.kind === 'ship') {
          const safePos = this.findSafeSpawnPos(ship.radius)
          ship.respawn(safePos)
          this.emit('respawn', { shipId, pos: safePos.clone() })
        }
      } else {
        this.respawnTimers.set(shipId, remaining)
      }
    }

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
  getSnapshot(tick = 0, serverTime = Date.now(), ackSeq = 0): SnapshotState {
    const entities: SnapshotData['entities'][number][] = []
    for (const entity of this.#entities.values()) {
      if (entity.alive) {
        entities.push(entity.serialize())
      }
    }
    return { tick: asTick(tick), serverTime, ackSeq: asSeq(ackSeq), entities }
  }

  /**
   * Відновлення стану з наданого знімка
   */
  loadSnapshot(snapshot: Pick<SnapshotData, 'entities'>): void {
    this.#entities.clear()
    for (const data of snapshot.entities ?? []) {
      let entity: GameEntity | null = null
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
        default: {
          assertNever(data)
        }
      }
      if (entity) {
        this.#entities.set(entity.id, entity)
      }
    }
  }
}
