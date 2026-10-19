import type { PickupData } from '../protocol/protocol.ts'
import { Entity } from './entity.ts'
import { Vector2 } from './vector.ts'
import {
  createPickupEffect,
  type PickupType,
  type PickupEffect,
} from './components.ts'
import type { Ship } from './ship.ts'
import type { World } from './world.ts'

export class Pickup extends Entity {
  override readonly kind = 'pickup'

  readonly type: PickupType
  ttl: number
  pulse: number
  readonly effect: PickupEffect

  constructor({
    id = null,
    pos,
    vel = Vector2.zero(),
    type = 'shield',
    ttl = 20,
    alive = true,
  }: {
    id?: number | null
    pos?: Vector2
    vel?: Vector2
    type?: PickupType
    ttl?: number
    alive?: boolean
  } = {}) {
    super({
      id: id ?? undefined,
      pos,
      vel,
      angle: 0,
      radius: 14,
      kind: 'pickup',
      alive,
    })

    this.type = type
    this.ttl = ttl
    this.pulse = 0

    this.effect = createPickupEffect({
      type,
      amount: type === 'shield' ? 40 : type === 'heal' ? 35 : 0,
      duration: type === 'rapid' ? 8 : type === 'homing' ? 10 : 8,
    })
  }

  collect(ship: Ship): string | null {
    this.destroy()
    return this.effect.apply(ship)
  }

  override update(dt: number, _world: World | null): void {
    this.pos = this.pos.add(this.vel.scale(dt))
    this.pulse += dt * 3
    this.angle += 0.8 * dt

    this.ttl -= dt
    if (this.ttl <= 0) {
      this.destroy()
    }
  }

  override serialize(): PickupData {
    return {
      ...super.serialize(),
      kind: 'pickup',
      type: this.type,
      ttl: this.ttl,
    }
  }

  static fromSnapshot(data: PickupData): Pickup {
    return new Pickup({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      type: data.type ?? 'shield',
      ttl: data.ttl ?? 20,
      alive: data.alive !== false,
    })
  }
}
