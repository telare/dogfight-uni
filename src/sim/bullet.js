import { Entity } from './entity.js'

/**
 * Клас кулі (снаряда).
 * Успадковує Entity (глибина спадкування = 1).
 * Поведінка самонаведення (homing) додається через композицію (this.homing),
 * а не через додатковий рівень HomingBullet extends Bullet!
 */
export class Bullet extends Entity {
  /**
   * @param {Object} options
   * @param {Vector2} options.pos - Початкова позиція (з носа корабля)
   * @param {Vector2} options.vel - Початкова швидкість
   * @param {number} [options.angle=0] - Кут польоту
   * @param {number} [options.ttl=1.5] - Час життя снаряда у секундах
   * @param {number} [options.damage=35] - Шкода при влучанні
   * @param {number} [options.ownerId=null] - ID сутності, що випустила снаряд
   * @param {Object} [options.homing=null] - Компонент самонаведення (опціонально)
   */
  constructor({
    pos,
    vel,
    angle = 0,
    ttl = 1.5,
    damage = 35,
    ownerId = null,
    homing = null,
  } = {}) {
    super({
      pos,
      vel,
      angle,
      radius: 4,
      kind: 'bullet',
    })

    this.ttl = ttl
    this.maxTtl = ttl
    this.damage = damage
    this.ownerId = ownerId

    // Композиція: компонент самонаведення приєднується як властивість
    this.homing = homing
  }

  /**
   * Чи є куля самонавідною
   * @returns {boolean}
   */
  get isHoming() {
    return Boolean(this.homing)
  }

  /**
   * Оновлення кулі: врахування самонаведення, рух та відлік TTL.
   * @param {number} dt
   * @param {import('./world.js').World} world
   */
  update(dt, world) {
    if (this.homing) {
      this.homing.update(this, dt, world)
    }

    super.update(dt, world)

    this.ttl -= dt
    if (this.ttl <= 0) {
      this.destroy()
    }
  }
}
