import {
  asEntityId,
  type EntityId,
  type BulletData,
} from '../protocol/protocol.ts'
import { Entity } from './entity.ts'
import { Vector2 } from './vector.ts'
import type { World } from './world.ts'

export class Bullet extends Entity {
  override readonly kind = 'bullet'

  ttl: number
  readonly maxTtl: number
  readonly damage: number
  ownerId: EntityId | null
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
    this.ownerId = ownerId === null ? null : asEntityId(ownerId)
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

  override serialize(): BulletData {
    return {
      ...super.serialize(),
      kind: 'bullet',
      ownerId: this.ownerId,
      damage: this.damage,
      ttl: this.ttl,
      isHoming: this.isHoming ? 1 : 0,
    }
  }

  static fromSnapshot(data: BulletData): Bullet {
    return new Bullet({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      angle: data.angle,
      ownerId: data.ownerId ?? null,
      damage: data.damage ?? 40,
      ttl: data.ttl ?? 1.4,
      isHoming: Boolean(data.isHoming),
      alive: data.alive !== false,
    })
  }
}
