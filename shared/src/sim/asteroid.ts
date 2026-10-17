import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { mulberry32 } from './prng.js'
import type { World } from './world.js'

export interface AsteroidVertex {
  readonly x: number
  readonly y: number
}

export class Asteroid extends Entity {
  #hp: number

  readonly tier: 1 | 2
  readonly maxHp: number
  readonly rotSpeed: number
  readonly vertices: readonly AsteroidVertex[]

  constructor({
    id = null,
    pos,
    vel = Vector2.zero(),
    angle = 0,
    tier = 2 as 1 | 2,
    radius,
    rotSpeed = 0.5,
    hp = null,
    alive = true,
  }: {
    id?: number | null
    pos?: Vector2
    vel?: Vector2
    angle?: number
    tier?: 1 | 2
    radius?: number
    rotSpeed?: number
    hp?: number | null
    alive?: boolean
  } = {}) {
    const resolvedRadius = radius ?? (tier === 2 ? 32 : 18)
    super({
      id: id ?? undefined,
      pos,
      vel,
      angle,
      radius: resolvedRadius,
      kind: 'asteroid',
      alive,
    })

    this.tier = tier
    this.maxHp = tier === 2 ? 60 : 25
    this.#hp = hp !== null && hp !== undefined ? hp : this.maxHp
    this.rotSpeed = rotSpeed
    this.vertices = this.#generateVertices()
  }

  get hp(): number {
    return this.#hp
  }

  takeDamage(amount: number): boolean {
    this.#hp = Math.max(0, this.#hp - amount)
    if (this.#hp <= 0) {
      this.destroy()
    }
    return this.#hp <= 0
  }

  #generateVertices(): AsteroidVertex[] {
    const rng = mulberry32(this.id * 7919 + 42)
    const count = 9 + Math.floor(rng() * 4)
    const vertices: AsteroidVertex[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const r = this.radius * (0.8 + rng() * 0.4)
      vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
    }
    return vertices
  }

  override update(dt: number, _world: World | null): void {
    this.angle += this.rotSpeed * dt
    this.pos = this.pos.add(this.vel.scale(dt))
  }

  override serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      tier: this.tier,
      hp: this.#hp,
      rotSpeed: this.rotSpeed,
    }
  }

  static fromSnapshot(data: Record<string, unknown>): Asteroid {
    const tier = (data['tier'] as number | undefined) === 1 ? 1 : (2 as 1 | 2)
    return new Asteroid({
      id: data['id'] as number,
      pos: new Vector2(data['x'] as number, data['y'] as number),
      vel: new Vector2(data['vx'] as number, data['vy'] as number),
      angle: data['angle'] as number,
      tier,
      radius: (data['radius'] as number | undefined) ?? (tier === 1 ? 18 : 32),
      rotSpeed: (data['rotSpeed'] as number | undefined) ?? 0.5,
      hp: data['hp'] as number | null,
      alive: data['alive'] !== false,
    })
  }
}
