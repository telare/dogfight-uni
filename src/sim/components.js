import { Vector2 } from './vector.js'

/**
 * Нормалізація різниці двох кутів у діапазон [-π, π].
 */
function normalizeAngleDiff(diff) {
  const tau = Math.PI * 2
  let d = ((diff % tau) + tau) % tau
  if (d > Math.PI) d -= tau
  return d
}

/**
 * Компонент самонаведення (Homing Behavior).
 * Може бути прикріплений до БУДЬ-ЯКОЇ сутності (наприклад, кулі чи астероїда)
 * без зміни її ієрархії класів.
 *
 * @param {Object} options
 * @param {string} [options.targetKind='asteroid'] - тип сутності, на яку ведеться полювання
 * @param {number} [options.turnRate=4.5] - максимальна швидкість повороту (рад/с)
 * @param {number} [options.speed=380] - лінійна швидкість руху
 * @param {number} [options.maxRange=900] - радіус захоплення цілі
 */
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

    /**
     * Оновлення орієнтації та вектору швидкості носія компонента.
     * @param {import('./entity.js').Entity} entity
     * @param {number} dt
     * @param {import('./world.js').World} world
     */
    update(entity, dt, world) {
      if (!world) return

      let target = currentTargetId ? world.get(currentTargetId) : null
      if (!target || !target.alive) {
        // Пошук найближчої живої цілі зазначеного типу
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

/**
 * Компонент підбирача / бонусу (Pickup Behavior).
 * Дозволяє стаціонарній або дрейфуючій сутності взаємодіяти з кораблем при підборі,
 * уникаючи потреби робити Pickup підкласом корабля чи додавати ігрову логіку в Entity.
 *
 * @param {Object} options
 * @param {'shield'|'rapid'|'homing'|'heal'} options.type - тип бонусу
 * @param {number} [options.amount=30] - значення ефекту (очки щита / здоров'я)
 * @param {number} [options.duration=8] - тривалість дії тимчасового посилення (секунди)
 */
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

    /**
     * Застосування ефекту до корабля при зіткненні
     * @param {import('./ship.js').Ship} ship
     * @returns {string} Опис отриманого ефекту для сповіщень HUD
     */
    apply(ship) {
      switch (type) {
        case 'shield':
          ship.addShield(amount, duration)
          return `ЩИТ +${amount} (${duration}s)`
        case 'rapid':
          ship.activateRapidFire(duration)
          return `ШВИДКОСТРІЛЬНІСТЬ (${duration}s)`
        case 'homing':
          ship.activateHomingMissiles(duration)
          return `САМОНАВІДНІ РАКЕТИ (${duration}s)`
        case 'heal':
          ship.heal(amount)
          return `РЕМОНТ +${amount} HP`
        default:
          return 'БОНУС АКТИВОВАНО'
      }
    },
  }
}
