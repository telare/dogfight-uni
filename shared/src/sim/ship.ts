import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { Bullet } from './bullet.js'
import type { World } from './world.js'

export const ROTATE_SPEED = 3.6
export const THRUST = 520
export const DRAG = 1.15
export const MAX_SPEED = 380

export interface ShipPhysicsState {
  pos: Vector2
  vel: Vector2
  angle: number
}

export interface ShipInput {
  thrust?: number
  turn?: number
  fire?: boolean
}

/**
 * Чиста детермінована функція інтегрування фізики корабля.
 * Однаково викликається на сервері та для client-side prediction на клієнті.
 */
export function integrateShipPhysics(
  state: ShipPhysicsState,
  input: ShipInput,
  dt: number,
): { pos: Vector2; vel: Vector2; angle: number; thrustVal: number } {
  let { angle, vel, pos } = state
  const turn = Number(input.turn) || 0
  const clampedTurn = Math.max(-1, Math.min(1, turn))
  angle += clampedTurn * ROTATE_SPEED * dt

  const thrustInput = Number(input.thrust) || 0
  const thrusting = Math.max(0, Math.min(1, thrustInput))
  const thrustVal = thrusting > 0 ? THRUST * thrusting : 0

  if (thrustVal > 0) {
    const thrustVec = Vector2.fromAngle(angle, thrustVal * dt)
    vel = vel.add(thrustVec)
  }

  // Експоненційне затухання швидкості (drag)
  const damp = Math.exp(-DRAG * dt)
  vel = vel.scale(damp)

  // Обмеження максимальної швидкості
  const speed = vel.length()
  if (speed > MAX_SPEED) {
    vel = vel.scale(MAX_SPEED / speed)
  }

  pos = pos.add(vel.scale(dt))

  return { pos, vel, angle, thrustVal }
}

export class Ship extends Entity {
  #hp: number

  playerId: string | null
  name: string
  maxHp: number
  thrust: number
  score: number
  fireCooldown: number
  baseFireInterval: number
  rapidFireTimer: number
  homingTimer: number
  shield: number
  shieldTimer: number

  constructor({
    id = null,
    pos = Vector2.zero(),
    vel = Vector2.zero(),
    angle = -Math.PI / 2,
    hp = 100,
    shield = 0,
    score = 0,
    playerId = null,
    name = 'Pilot',
    alive = true,
  }: {
    id?: number | null
    pos?: Vector2
    vel?: Vector2
    angle?: number
    hp?: number
    shield?: number
    score?: number
    playerId?: string | null
    name?: string
    alive?: boolean
  } = {}) {
    super({
      id: id ?? undefined,
      pos,
      vel,
      angle,
      radius: 16,
      kind: 'ship',
      alive,
    })

    this.playerId = playerId
    this.name = name
    this.#hp = Math.max(0, Math.min(100, hp))
    this.maxHp = 100
    this.thrust = 0
    this.score = score

    this.fireCooldown = 0
    this.baseFireInterval = 0.2
    this.rapidFireTimer = 0
    this.homingTimer = 0

    this.shield = Math.max(0, Math.min(100, shield))
    this.shieldTimer = 0
  }

  get hp(): number {
    return this.#hp
  }

  setHp(val: number | undefined): void {
    if (val === undefined) return
    this.#hp = Math.max(0, Math.min(this.maxHp, val))
    if (this.#hp <= 0) {
      this.destroy()
    }
  }

  takeDamage(amount: number): void {
    if (this.shield > 0) {
      if (this.shield >= amount) {
        this.shield -= amount
        return
      } else {
        const remaining = amount - this.shield
        this.shield = 0
        this.#hp = Math.max(0, this.#hp - remaining)
      }
    } else {
      this.#hp = Math.max(0, this.#hp - amount)
    }

    if (this.#hp <= 0) {
      this.destroy()
    }
  }

  heal(amount: number): void {
    if (!this.alive) return
    this.#hp = Math.min(this.maxHp, this.#hp + amount)
  }

  addShield(amount: number, duration = 5.0): void {
    if (!this.alive) return
    this.shield = Math.min(100, this.shield + amount)
    this.shieldTimer = Math.max(this.shieldTimer, duration)
  }

  activateRapidFire(duration = 6.0): void {
    if (!this.alive) return
    this.rapidFireTimer = Math.max(this.rapidFireTimer, duration)
  }

  activateHomingMissiles(duration = 6.0): void {
    if (!this.alive) return
    this.homingTimer = Math.max(this.homingTimer, duration)
  }

  /**
   * Постріл з носа корабля. Повертає створену кулю або null.
   */
  fire(world: World | null): Bullet | null {
    if (!this.alive || this.fireCooldown > 0) {
      return null
    }

    const noseOffset = Vector2.fromAngle(this.angle, this.radius + 6)
    const spawnPos = this.pos.add(noseOffset)
    const bulletSpeed = 540
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, bulletSpeed))

    const isHoming = this.homingTimer > 0

    const bullet = new Bullet({
      pos: spawnPos,
      vel: bulletVel,
      angle: this.angle,
      ttl: 1.4,
      damage: 40,
      ownerId: this.id,
      isHoming,
    })

    if (world) {
      world.spawn(bullet)
      world.emit?.('fired', {
        kind: 'bullet',
        pos: spawnPos,
        ownerId: this.id,
        isHoming,
      })
    }

    const interval =
      this.rapidFireTimer > 0
        ? this.baseFireInterval * 0.45
        : this.baseFireInterval
    this.fireCooldown = interval

    return bullet
  }

  /**
   * Крок фізики та обробки вхідних команд (Input Integration)
   */
  stepInput(
    input: ShipInput = {},
    dt = 1 / 30,
    world: World | null = null,
  ): void {
    if (this.fireCooldown > 0) this.fireCooldown -= dt
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt
    if (this.homingTimer > 0) this.homingTimer -= dt

    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt
      if (this.shieldTimer <= 0) {
        this.shield = 0
      }
    }

    if (!this.alive) return

    const res = integrateShipPhysics(
      { pos: this.pos, vel: this.vel, angle: this.angle },
      input,
      dt,
    )
    this.pos = res.pos
    this.vel = res.vel
    this.angle = res.angle
    this.thrust = res.thrustVal

    if (input.fire && this.fireCooldown <= 0) {
      this.fire(world)
    }
  }

  // world parameter used via stepInput (passive drift)
  override update(dt: number, world: World | null): void {
    this.stepInput({}, dt, world)
  }

  cloneState(): {
    pos: Vector2
    vel: Vector2
    angle: number
    thrust: number
    hp: number
    shield: number
    score: number
    alive: boolean
  } {
    return {
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      thrust: this.thrust,
      hp: this.#hp,
      shield: this.shield,
      score: this.score,
      alive: this.alive,
    }
  }

  respawn(safePos: Vector2): void {
    this.pos = safePos.clone()
    this.vel = Vector2.zero()
    this.angle = -Math.PI / 2
    this.#hp = this.maxHp
    this.alive = true
    this.thrust = 0
    this.fireCooldown = 0
    this.shield = 40
    this.shieldTimer = 3.0
  }

  override serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      playerId: this.playerId,
      name: this.name,
      hp: this.#hp,
      shield: this.shield,
      thrust: this.thrust > 0 ? 1 : 0,
      score: this.score,
    }
  }

  static fromSnapshot(data: Record<string, unknown>): Ship {
    const ship = new Ship({
      id: data['id'] as number,
      pos: new Vector2(data['x'] as number, data['y'] as number),
      vel: new Vector2(data['vx'] as number, data['vy'] as number),
      angle: data['angle'] as number,
      hp: data['hp'] as number,
      shield: data['shield'] as number,
      score: (data['score'] as number | undefined) ?? 0,
      playerId: (data['playerId'] as string | null | undefined) ?? null,
      name: (data['name'] as string | undefined) ?? 'Pilot',
      alive: data['alive'] !== false,
    })
    ship.thrust = data['thrust'] ? THRUST : 0
    return ship
  }
}
