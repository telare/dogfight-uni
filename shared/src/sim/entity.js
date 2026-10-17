import { Vector2 } from './vector.js'

/**
 * Базовий клас ігрової сутності для чистої симуляції (Client & Server).
 * Підтримує відновлення стану зі знімка (fromSnapshot) та серіалізацію.
 */
export class Entity {
  static #nextId = 1

  static get nextId() {
    return Entity.#nextId
  }

  static resetIdCounter(start = 1) {
    Entity.#nextId = start
  }

  #id

  /**
   * @param {Object} options
   * @param {number} [options.id]
   * @param {Vector2} [options.pos]
   * @param {Vector2} [options.vel]
   * @param {number} [options.angle]
   * @param {number} [options.radius]
   * @param {string} [options.kind]
   * @param {boolean} [options.alive]
   */
  constructor({
    id = null,
    pos = Vector2.zero(),
    vel = Vector2.zero(),
    angle = 0,
    radius = 12,
    kind = 'entity',
    alive = true,
  } = {}) {
    this.hasExplicitId = typeof id === 'number' && id > 0
    this.#id = this.hasExplicitId ? id : null
    this.pos = pos instanceof Vector2 ? pos : new Vector2(pos?.x, pos?.y)
    this.vel = vel instanceof Vector2 ? vel : new Vector2(vel?.x, vel?.y)
    this.angle = Number(angle) || 0
    this.radius = Number(radius) || 12
    this.kind = kind
    this.alive = alive !== false
  }

  get id() {
    if (this.#id === null) {
      this.#id = Entity.#nextId++
    }
    return this.#id
  }

  assignId(id) {
    if (typeof id === 'number' && id > 0) {
      this.#id = id
      this.hasExplicitId = true
    }
  }

  // eslint-disable-next-line no-unused-vars
  update(dt, world) {
    this.pos = this.pos.add(this.vel.scale(dt))
  }

  destroy() {
    this.alive = false
  }

  serialize() {
    return {
      id: this.#id,
      kind: this.kind,
      x: this.pos.x,
      y: this.pos.y,
      vx: this.vel.x,
      vy: this.vel.y,
      angle: this.angle,
      radius: this.radius,
      alive: this.alive,
    }
  }

  static fromSnapshot(data) {
    return new Entity({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      angle: data.angle,
      radius: data.radius,
      kind: data.kind,
      alive: data.alive,
    })
  }
}
