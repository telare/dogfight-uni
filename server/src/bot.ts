import type { Ship, ShipInput, World } from 'shared'

/** Deterministic controller using exactly the human ship input contract. */
export class Bot implements ShipInput {
  thrust = 1
  turn = 0
  fire = false

  update(ship: Ship, world: World): this {
    let target: Ship | undefined
    let distance = Infinity
    for (const entity of world) {
      if (entity.kind !== 'ship' || entity === ship || !entity.alive) continue
      const d = ship.pos.distSq(entity.pos)
      if (d < distance) {
        target = entity
        distance = d
      }
    }
    const heading = target
      ? Math.atan2(target.pos.y - ship.pos.y, target.pos.x - ship.pos.x)
      : ship.angle + 0.4
    const delta = Math.atan2(
      Math.sin(heading - ship.angle),
      Math.cos(heading - ship.angle),
    )
    // Turn away at close range; otherwise chase and fire when aligned.
    this.turn = Math.max(-1, Math.min(1, delta * 2 + (distance < 6400 ? 2 : 0)))
    this.thrust = distance < 6400 ? 0.3 : 1
    this.fire = Boolean(target) && Math.abs(delta) < 0.5
    return this
  }
}
