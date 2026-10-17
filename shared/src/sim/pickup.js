import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { createPickupEffect } from './components.js'

export class Pickup extends Entity {
  constructor({
    id = null,
    pos,
    vel = Vector2.zero(),
    type = 'shield',
    ttl = 20,
    alive = true,
  } = {}) {
    super({
      id,
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

  collect(ship) {
    this.destroy()
    return this.effect.apply(ship)
  }

  update(dt, world) {
    super.update(dt, world)
    this.pulse += dt * 3
    this.angle += 0.8 * dt

    this.ttl -= dt
    if (this.ttl <= 0) {
      this.destroy()
    }
  }

  serialize() {
    return {
      ...super.serialize(),
      type: this.type,
      ttl: this.ttl,
    }
  }

  static fromSnapshot(data) {
    return new Pickup({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      type: data.type || 'shield',
      ttl: data.ttl ?? 20,
      alive: data.alive !== false,
    })
  }
}
