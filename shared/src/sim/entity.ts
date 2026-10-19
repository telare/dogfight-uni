import type { World } from './world.ts'
export { asEntityId, asTick, asSeq } from '../protocol/protocol.ts'
export type {
  EntityId,
  Tick,
  Seq,
  EntityData,
  ShipData,
  BulletData,
  AsteroidData,
  PickupData,
  SnapshotData,
} from '../protocol/protocol.ts'
import { asEntityId, type EntityId } from '../protocol/protocol.ts'
import { Vector2 } from './vector.ts'

export interface EntityOptions {
  id?: EntityId | number | null | undefined
  pos?: { readonly x: number; readonly y: number } | undefined
  vel?: { readonly x: number; readonly y: number } | undefined
  angle?: number | undefined
  radius?: number | undefined
  kind?: string | undefined
  alive?: boolean | undefined
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
    this.#id = typeof id === 'number' && id > 0 ? asEntityId(id) : null
    this.pos = pos instanceof Vector2 ? pos : new Vector2(pos.x, pos.y)
    this.vel = vel instanceof Vector2 ? vel : new Vector2(vel.x, vel.y)
    this.angle = Number(angle) || 0
    this.radius = Number(radius) || 12
    this.kind = kind
    this.alive = alive !== false
  }

  get id(): EntityId {
    if (this.#id === null) {
      this.#id = asEntityId(Entity.#nextId)
      Entity.#nextId = Entity.#nextId === 0xffff ? 1 : Entity.#nextId + 1
    }
    return this.#id
  }

  assignId(id: EntityId): void {
    if (typeof id === 'number' && id > 0) {
      this.#id = asEntityId(id)
      this.hasExplicitId = true
    }
  }

  // world parameter intentionally unused in base — subclasses override
  update(_dt: number, _world: World | null): void {
    this.pos = this.pos.add(this.vel.scale(_dt))
  }

  destroy(): void {
    this.alive = false
  }

  serialize(): Readonly<{
    id: EntityId
    kind: string
    x: number
    y: number
    vx: number
    vy: number
    angle: number
    radius?: number
    alive: boolean
  }> {
    return {
      id: this.id,
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
}
