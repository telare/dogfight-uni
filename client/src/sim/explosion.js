import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

/**
 * Сутність вибуху (Explosion).
 * Успадковує Entity (глибина = 1).
 * Керує ансамблем частинок (particle system).
 * Багато короткоживучих об'єктів створюють реалістичний ефект детонації.
 */
export class Explosion extends Entity {
  /**
   * @param {Object} options
   * @param {Vector2} options.pos
   * @param {number} [options.count=24]
   * @param {'ship'|'asteroid'} [options.style='asteroid']
   */
  constructor({ pos, count = 24, style = 'asteroid' } = {}) {
    super({
      pos,
      vel: Vector2.zero(),
      radius: 0,
      kind: 'explosion',
    })

    this.style = style
    this.particles = []

    const colors =
      style === 'ship'
        ? ['#60a5fa', '#38bdf8', '#f87171', '#fbbf24', '#ffffff']
        : ['#f97316', '#fbbf24', '#ef4444', '#94a3b8']

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * (style === 'ship' ? 240 : 160)
      const maxLife = 0.4 + Math.random() * 0.45
      const color = colors[Math.floor(Math.random() * colors.length)]

      this.particles.push({
        pos: pos.clone(),
        vel: Vector2.fromAngle(angle, speed),
        life: maxLife,
        maxLife,
        size: 2 + Math.random() * 3.5,
        color,
      })
    }
  }

  /**
   * Оновлення кожної частинки у системі
   * @param {number} dt
   */
  update(dt) {
    let allDead = true

    for (const p of this.particles) {
      if (p.life > 0) {
        p.pos = p.pos.add(p.vel.scale(dt))
        p.vel = p.vel.scale(Math.exp(-2.5 * dt)) // гальмування частинок
        p.life -= dt
        if (p.life > 0) {
          allDead = false
        }
      }
    }

    if (allDead) {
      this.destroy()
    }
  }
}
