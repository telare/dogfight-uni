import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

/**
 * Клас астероїда / перешкоди.
 * Успадковує Entity (глибина = 1).
 * Може отримувати компонент самонаведення (this.homing),
 * перетворюючись на небезпечний "Астероїд-мисливець", що переслідує корабель!
 */
export class Asteroid extends Entity {
  #hp

  /**
   * @param {Object} options
   * @param {Vector2} options.pos
   * @param {Vector2} [options.vel]
   * @param {number} [options.tier=2] - Розмір (2 = великий, 1 = малий)
   * @param {number} [options.radius]
   * @param {number} [options.rotSpeed]
   * @param {Object} [options.homing=null] - Компонент самонаведення через композицію
   */
  constructor({
    pos,
    vel = Vector2.zero(),
    tier = 2,
    radius = tier === 2 ? 32 : 18,
    rotSpeed = (Math.random() - 0.5) * 1.5,
    homing = null,
  } = {}) {
    super({
      pos,
      vel,
      angle: Math.random() * Math.PI * 2,
      radius,
      kind: 'asteroid',
    })

    this.tier = tier
    this.#hp = tier === 2 ? 60 : 25
    this.maxHp = this.#hp
    this.rotSpeed = rotSpeed
    this.homing = homing

    // Генерація процедурних вершин форми астероїда для красивого малювання
    this.vertices = this.#generateVertices()
  }

  get hp() {
    return this.#hp
  }

  get isHoming() {
    return Boolean(this.homing)
  }

  takeDamage(amount) {
    this.#hp = Math.max(0, this.#hp - amount)
    if (this.#hp <= 0) {
      this.destroy()
    }
    return this.#hp <= 0
  }

  /**
   * Генерація нерегулярного полігону астероїда
   */
  #generateVertices() {
    const count = 9 + Math.floor(Math.random() * 4)
    const vertices = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const r = this.radius * (0.8 + Math.random() * 0.4)
      vertices.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
      })
    }
    return vertices
  }

  /**
   * Оновлення астероїда: обробка компонента самонаведення (якщо є)
   * та обертання корпусу.
   * @param {number} dt
   * @param {import('./world.js').World} world
   */
  update(dt, world) {
    if (this.homing) {
      this.homing.update(this, dt, world)
    } else {
      this.angle += this.rotSpeed * dt
    }

    super.update(dt, world)
  }
}
