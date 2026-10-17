import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import type { World } from './world.js'

export class Bullet extends Entity {
  ttl: number
  readonly maxTtl: number
  readonly damage: number
  ownerId: number | null
  isHoming: boolean
  isPredicted: boolean

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
  }: {
    id?: number | null
    pos?: Vector2
    vel?: Vector2
    angle?: number
    ttl?: number
    damage?: number
    ownerId?: number | null
    isHoming?: boolean
    alive?: boolean
  } = {}) {
    super({
      id: id ?? undefined,
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

  override update(dt: number, world: World | null): void {
    if (this.isHoming && world) {
      let closestTarget: Entity | null = null
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

  override serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      ownerId: this.ownerId,
      damage: this.damage,
      ttl: this.ttl,
      isHoming: this.isHoming ? 1 : 0,
    }
  }

  static fromSnapshot(data: Record<string, unknown>): Bullet {
    return new Bullet({
      id: data['id'] as number,
      pos: new Vector2(data['x'] as number, data['y'] as number),
      vel: new Vector2(data['vx'] as number, data['vy'] as number),
      angle: data['angle'] as number,
      ownerId: (data['ownerId'] as number | null) ?? null,
      damage: (data['damage'] as number | undefined) ?? 40,
      ttl: (data['ttl'] as number | undefined) ?? 1.4,
      isHoming: Boolean(data['isHoming']),
      alive: data['alive'] !== false,
    })
  }
}
