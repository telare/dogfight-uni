import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { createPickupEffect } from './components.js'

/**
 * Клас бонусу (Pickup).
 * Успадковує Entity (глибина = 1).
 * Стаціонарний або плавно дрейфуючий, взаємодіє через колізії, але НЕ є кораблем!
 * Логіка ефекту інкапсульована у компоненті this.effect (композиція замість підкласів).
 */
export class Pickup extends Entity {
  /**
   * @param {Object} options
   * @param {Vector2} options.pos
   * @param {Vector2} [options.vel]
   * @param {'shield'|'rapid'|'homing'|'heal'} [options.type='shield']
   * @param {number} [options.ttl=20] - Час життя бонусу у світі
   */
  constructor({ pos, vel = Vector2.zero(), type = 'shield', ttl = 20 } = {}) {
    super({
      pos,
      vel,
      angle: 0,
      radius: 14,
      kind: 'pickup',
    })

    this.type = type
    this.ttl = ttl
    this.pulse = 0

    // Композиція: поведінка та ефект бонусу підключаються як компонент
    this.effect = createPickupEffect({
      type,
      amount: type === 'shield' ? 40 : type === 'heal' ? 35 : 0,
      duration: type === 'rapid' ? 8 : type === 'homing' ? 10 : 8,
    })
  }

  /**
   * Застосування бонусу до корабля гравця
   * @param {import('./ship.js').Ship} ship
   * @returns {string}
   */
  collect(ship) {
    this.destroy()
    return this.effect.apply(ship)
  }

  /**
   * Оновлення бонусу: анімація пульсації та відлік TTL
   * @param {number} dt
   * @param {import('./world.js').World} world
   */
  update(dt, world) {
    super.update(dt, world)
    this.pulse += dt * 3
    this.angle += 0.8 * dt

    this.ttl -= dt
    if (this.ttl <= 0) {
      this.destroy()
    }
  }
}
