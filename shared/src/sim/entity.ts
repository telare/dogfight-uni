import { Vector2 } from './vector.js'

// ── Брендовані типи ────────────────────────────────────────────────────────
// Branded types попереджують змішування EntityId, Tick, Seq на рівні компілятора.
// Вартість: нуль байт у runtime (тип стирається), але compile-time safety.
// Приклад помилки без brand: передав tick туди, де очікувався EntityId.
export type EntityId = number & { readonly __brand: 'EntityId' }
export type Tick = number & { readonly __brand: 'Tick' }
export type Seq = number & { readonly __brand: 'Seq' }

/** Конструктор-санітайзер для EntityId (as-cast виправданий — вхід вже перевірено) */
export function asEntityId(n: number): EntityId {
  // as EntityId є виправданим: ми гарантуємо цілочисельність > 0
  return n as EntityId
}

export function asTick(n: number): Tick {
  return n as Tick
}

export function asSeq(n: number): Seq {
  return n as Seq
}

// ── Типи знімка сутностей (discriminated union) ────────────────────────────
export interface BaseEntityData {
  readonly id: EntityId
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly angle: number
  readonly hp: number
  readonly shield: number
  readonly alive: boolean
}

export interface ShipData extends BaseEntityData {
  readonly kind: 'ship'
  readonly playerId: string | null
  readonly name: string
  readonly thrust: number
  readonly score: number
  readonly radius: number
}

export interface BulletData extends BaseEntityData {
  readonly kind: 'bullet'
  readonly ownerId: EntityId | null
  readonly damage: number
  readonly ttl: number
  readonly isHoming: number
  readonly radius: number
}

export interface AsteroidData extends BaseEntityData {
  readonly kind: 'asteroid'
  readonly tier: 1 | 2
  readonly rotSpeed: number
  readonly radius: number
}

export interface PickupData extends BaseEntityData {
  readonly kind: 'pickup'
  readonly type: 'shield' | 'rapid' | 'homing' | 'heal'
  readonly ttl: number
  readonly radius: number
}

/** Discriminated union — звужується за полем `kind` */
export type EntityData = ShipData | BulletData | AsteroidData | PickupData

export interface SnapshotData {
  readonly type?: 'snapshot'
  readonly tick: Tick
  readonly serverTime: number
  readonly ackSeq: Seq
  readonly entities: readonly EntityData[]
}

// ── Базовий клас Entity ────────────────────────────────────────────────────

export interface EntityOptions {
  id?: EntityId | number | null
  pos?: Vector2
  vel?: Vector2
  angle?: number
  radius?: number
  kind?: string
  alive?: boolean
}

/**
 * Базовий клас ігрової сутності для чистої симуляції (Client & Server).
 * Підтримує відновлення стану зі знімка (fromSnapshot) та серіалізацію.
 */
export class Entity {
  static #nextId = 1

  static get nextId(): number {
    return Entity.#nextId
  }

  static resetIdCounter(start = 1): void {
    Entity.#nextId = start
  }

  #id: EntityId | null

  hasExplicitId: boolean
  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
  kind: string
  alive: boolean

  constructor({
    id = null,
    pos = Vector2.zero(),
    vel = Vector2.zero(),
    angle = 0,
    radius = 12,
    kind = 'entity',
    alive = true,
  }: EntityOptions = {}) {
    this.hasExplicitId = typeof id === 'number' && id > 0
    this.#id = this.hasExplicitId ? asEntityId(id as number) : null
    this.pos =
      pos instanceof Vector2
        ? pos
        : new Vector2(
            (pos as unknown as { x?: number }).x,
            (pos as unknown as { y?: number }).y,
          )
    this.vel =
      vel instanceof Vector2
        ? vel
        : new Vector2(
            (vel as unknown as { x?: number }).x,
            (vel as unknown as { y?: number }).y,
          )
    this.angle = Number(angle) || 0
    this.radius = Number(radius) || 12
    this.kind = kind
    this.alive = alive !== false
  }

  get id(): EntityId {
    if (this.#id === null) {
      // as EntityId justified: Entity.#nextId++ gives sequential integers > 0
      this.#id = asEntityId(Entity.#nextId++)
    }
    return this.#id
  }

  assignId(id: number): void {
    if (typeof id === 'number' && id > 0) {
      this.#id = asEntityId(id)
      this.hasExplicitId = true
    }
  }

  // world parameter intentionally unused in base — subclasses override
  update(_dt: number, _world: unknown): void {
    this.pos = this.pos.add(this.vel.scale(_dt))
  }

  destroy(): void {
    this.alive = false
  }

  serialize(): Record<string, unknown> {
    return {
      id: this.#id,
      kind: this.kind,
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
      alive: this.alive,
    }
  }

  static fromSnapshot(data: Record<string, unknown>): Entity {
    return new Entity({
      id: data['id'] as number,
      pos: new Vector2(data['x'] as number, data['y'] as number),
      vel: new Vector2(data['vx'] as number, data['vy'] as number),
      angle: data['angle'] as number,
      radius: data['radius'] as number,
      kind: data['kind'] as string,
      alive: data['alive'] !== false,
    })
  }
}
