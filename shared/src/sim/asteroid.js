import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { mulberry32 } from './prng.js'

export class Asteroid extends Entity {
  #hp

  constructor({
    id = null,
    pos,
    vel = Vector2.zero(),
    angle = 0,
    tier = 2,
    radius = tier === 2 ? 32 : 18,
    rotSpeed = 0.5,
    hp = null,
    alive = true,
  } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      kind: 'asteroid',
      alive,
    })

    this.tier = tier
    this.maxHp = tier === 2 ? 60 : 25
    this.#hp = hp !== null ? hp : this.maxHp
    this.rotSpeed = rotSpeed

    // Детермінована генерація вершин форми на основі id
    this.vertices = this.#generateVertices()
  }

  get hp() {
    return this.#hp
  }

  takeDamage(amount) {
    this.#hp = Math.max(0, this.#hp - amount)
    if (this.#hp <= 0) {
      this.destroy()
    }
    return this.#hp <= 0
  }

  #generateVertices() {
    const rng = mulberry32(this.id * 7919 + 42)
    const count = 9 + Math.floor(rng() * 4)
    const vertices = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const r = this.radius * (0.8 + rng() * 0.4)
      vertices.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
      })
    }
    return vertices
  }

  update(dt, world) {
    this.angle += this.rotSpeed * dt
    super.update(dt, world)
  }

  serialize() {
    return {
      ...super.serialize(),
      tier: this.tier,
      hp: this.#hp,
      rotSpeed: this.rotSpeed,
    }
  }

  static fromSnapshot(data) {
    return new Asteroid({
      id: data.id,
      pos: new Vector2(data.x, data.y),
      vel: new Vector2(data.vx, data.vy),
      angle: data.angle,
      tier: data.tier || 2,
      radius: data.radius || (data.tier === 1 ? 18 : 32),
      rotSpeed: data.rotSpeed ?? 0.5,
      hp: data.hp,
      alive: data.alive !== false,
    })
  }
}
