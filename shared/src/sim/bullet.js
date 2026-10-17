import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export class Bullet extends Entity {
  constructor({
    id = null,
    pos,
    vel,
    angle = 0,
    ttl = 1.4,
    damage = 40,
    ownerId = null,
    isHoming = false,
    alive = true,
  } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius: 4,
      kind: 'bullet',
      alive,
    })

    this.ttl = ttl
    this.maxTtl = ttl
    this.damage = damage
    this.ownerId = ownerId
    this.isHoming = Boolean(isHoming)
    this.isPredicted = false
  }

  update(dt, world) {
    if (this.isHoming && world) {
      let closestTarget = null
      let closestDistSq = Infinity

      for (const target of world.ofKind('asteroid')) {
        if (!target.alive) continue
        const dSq = this.pos.distSq(target.pos)
        if (dSq < closestDistSq) {
          closestDistSq = dSq
          closestTarget = target
        }
      }

      if (closestTarget) {
        const toTarget = closestTarget.pos.sub(this.pos).normalize()
        const currentHeading = Vector2.fromAngle(this.angle)
        const newHeading = Vector2.lerp(
          currentHeading,
          toTarget,
          5.5 * dt,
        ).normalize()
        this.angle = Math.atan2(newHeading.y, newHeading.x)
        const speed = 480
        this.vel = newHeading.scale(speed)
      }
    }

    super.update(dt, world)

    this.ttl -= dt
    if (this.ttl <= 0) {
      this.destroy()
    }
  }

  serialize() {
    return {
      ...super.serialize(),
      ownerId: this.ownerId,
      damage: this.damage,
      ttl: this.ttl,
      isHoming: this.isHoming ? 1 : 0,
    }
  }

  static fromSnapshot(data) {
    return new Bullet({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      angle: data.angle,
      ownerId: data.ownerId,
      damage: data.damage || 40,
      ttl: data.ttl ?? 1.4,
      isHoming: Boolean(data.isHoming),
      alive: data.alive !== false,
    })
  }
}
