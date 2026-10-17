import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import {
  createPickupEffect,
  type PickupType,
  type PickupEffect,
} from './components.js'
import type { Ship } from './ship.js'
import type { World } from './world.js'

export class Pickup extends Entity {
  readonly type: PickupType
  ttl: number
  pulse: number
  readonly effect: PickupEffect

  constructor({
    id = null,
    pos,
    vel = Vector2.zero(),
    type = 'shield' as PickupType,
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

    this.type = type as PickupType
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

  override serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      type: this.type,
      ttl: this.ttl,
    }
  }

  static fromSnapshot(data: Record<string, unknown>): Pickup {
    return new Pickup({
      id: data['id'] as number,
      pos: new Vector2(data['x'] as number, data['y'] as number),
      vel: new Vector2(data['vx'] as number, data['vy'] as number),
      type: (data['type'] as PickupType | undefined) ?? 'shield',
      ttl: (data['ttl'] as number | undefined) ?? 20,
      alive: data['alive'] !== false,
    })
  }
}
