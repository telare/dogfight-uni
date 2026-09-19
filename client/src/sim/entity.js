import { Vector2 } from './vector.js'

/**
 * Базовий клас ігрової сутності.
 * Демонструє використання ES2022 private fields (#id, #nextId)
 * та інкапсуляцію ідентифікатора сутності через публічний getter.
 */
export class Entity {
  static #nextId = 1

  #id = Entity.#nextId++

  /**
   * @param {Object} options
   * @param {Vector2} [options.pos] - Позиція у просторі
   * @param {Vector2} [options.vel] - Вектор швидкості
   * @param {number} [options.angle] - Кут орієнтації в радіанах
   * @param {number} [options.radius] - Радіус колізійного кола
   * @param {string} [options.kind] - Категорія сутності ('ship', 'bullet', 'asteroid', etc.)
   */
  constructor({
    pos = Vector2.zero(),
    vel = Vector2.zero(),
    angle = 0,
    radius = 12,
    kind = 'entity',
  } = {}) {
    this.pos = pos
    this.vel = vel
    this.angle = angle
    this.radius = radius
    this.kind = kind
    this.alive = true
  }

  /**
   * Унікальний числовий ідентифікатор сутності.
   * Доступний лише для читання через геттер.
   * @returns {number}
   */
  get id() {
    return this.#id
  }

  /**
   * Базовий крок оновлення сутності: переміщення за вектором швидкості.
   * @param {number} dt - дельта часу (секунди)
   * @param {import('./world.js').World} [world] - посилання на ігровий світ
   */
  // eslint-disable-next-line no-unused-vars
  update(dt, world) {
    this.pos = this.pos.add(this.vel.scale(dt))
  }

  /**
   * Позначення сутності як мертвої для відкладеного прибирання (deferred sweep).
   */
  destroy() {
    this.alive = false
  }
}
