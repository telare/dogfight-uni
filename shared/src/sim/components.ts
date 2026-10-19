import { Vector2 } from './vector.ts'
import { Entity } from './entity.ts'
import type { World } from './world.ts'
import type { EntityId } from '../protocol/protocol.ts'

export function normalizeAngleDiff(diff: number): number {
  const tau = Math.PI * 2
  let d = ((diff % tau) + tau) % tau
  if (d > Math.PI) d -= tau
  return d
}

export interface HomingComponent {
  readonly name: 'homing'
  readonly targetKind: string
  readonly turnRate: number
  readonly speed: number
  update(entity: Entity, dt: number, world: World | null): void
}

export function createHoming({
  targetKind = 'asteroid',
  turnRate = 4.5,
  speed = 380,
  maxRange = 900,
} = {}): HomingComponent {
  let currentTargetId: EntityId | null = null

  return {
    name: 'homing',
    targetKind,
    turnRate,
    speed,

    update(entity: Entity, dt: number, world: World | null): void {
      if (!world) return

      let target: Entity | undefined =
        currentTargetId !== null ? world.get(currentTargetId) : undefined
      if (!target?.alive) {
        let nearestDistSq = maxRange * maxRange
        target = undefined

        for (const candidate of world.ofKind(targetKind)) {
          if (!candidate.alive || candidate.id === entity.id) continue
          const dSq = entity.pos.distSq(candidate.pos)
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq
            target = candidate
          }
        }
        currentTargetId = target ? target.id : null
      }

      if (target?.alive) {
        const toTarget = target.pos.sub(entity.pos)
        const targetAngle = Math.atan2(toTarget.y, toTarget.x)
        const angleDiff = normalizeAngleDiff(targetAngle - entity.angle)

        const maxTurn = turnRate * dt
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff))

        entity.angle += turn
        entity.vel = Vector2.fromAngle(entity.angle, speed)
      }
    },
  }
}

export type PickupType = 'shield' | 'rapid' | 'homing' | 'heal'

export interface PickupEffect {
  readonly name: 'pickupEffect'
  readonly type: PickupType
  readonly amount: number
  readonly duration: number
  apply(ship: import('./ship.ts').Ship | null | undefined): string | null
}

export function createPickupEffect({
  type = 'shield',
  amount = 30,
  duration = 8,
}: {
  type?: PickupType
  amount?: number
  duration?: number
} = {}): PickupEffect {
  return {
    name: 'pickupEffect',
    type: type,
    amount,
    duration,

    apply(ship: import('./ship.ts').Ship | null | undefined): string | null {
      if (!ship?.alive) return null

      switch (type) {
        case 'shield':
          ship.addShield(amount || 40, duration || 8)
          return `Щит активовано (+${amount || 40})`
        case 'rapid':
          ship.activateRapidFire(duration || 8)
          return `Скорострільність +100% (${duration || 8}с)`
        case 'homing':
          ship.activateHomingMissiles(duration || 10)
          return `Самонавідні ракети (${duration || 10}с)`
        case 'heal':
          ship.heal(amount || 35)
          return `Ремонт корпусу (+${amount || 35} HP)`
        default: {
          // Exhaustive check — якщо додати новий тип, компілятор покаже помилку тут
          const _exhaustive: never = type
          return _exhaustive
        }
      }
    },
  }
}
