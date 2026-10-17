import { Vector2 } from './vector.js'

export function normalizeAngleDiff(diff) {
  const tau = Math.PI * 2
  let d = ((diff % tau) + tau) % tau
  if (d > Math.PI) d -= tau
  return d
}

export function createHoming({
  targetKind = 'asteroid',
  turnRate = 4.5,
  speed = 380,
  maxRange = 900,
} = {}) {
  let currentTargetId = null

  return {
    name: 'homing',
    targetKind,
    turnRate,
    speed,

    update(entity, dt, world) {
      if (!world) return

      let target = currentTargetId ? world.get(currentTargetId) : null
      if (!target || !target.alive) {
        let nearestDistSq = maxRange * maxRange
        target = null

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

      if (target && target.alive) {
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

export function createPickupEffect({
  type = 'shield',
  amount = 30,
  duration = 8,
} = {}) {
  return {
    name: 'pickupEffect',
    type,
    amount,
    duration,

    apply(ship) {
      if (!ship || !ship.alive) return null

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
        default:
          return null
      }
    },
  }
}
