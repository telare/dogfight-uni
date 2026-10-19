import { Asteroid } from './asteroid.ts'
import type { PickupType } from './components.ts'
import { Pickup } from './pickup.ts'
import { Vector2 } from './vector.ts'
import type { GameEntity, World } from './world.ts'
import type { Bullet } from './bullet.ts'
import type { Ship } from './ship.ts'

export function circlesIntersect(
  posA: Vector2,
  radiusA: number,
  posB: Vector2,
  radiusB: number,
): boolean {
  const rSum = radiusA + radiusB
  return posA.distSq(posB) <= rSum * rSum
}

export type CollisionPair = [GameEntity, GameEntity]

export function findCollisionsNaive(world: World): CollisionPair[] {
  const entities = Array.from(world)
  const len = entities.length
  const pairs: CollisionPair[] = []

  for (let i = 0; i < len; i++) {
    const a = entities[i]
    if (!a?.alive || a.radius <= 0) continue

    for (let j = i + 1; j < len; j++) {
      const b = entities[j]
      if (!b?.alive || b.radius <= 0) continue

      if (circlesIntersect(a.pos, a.radius, b.pos, b.radius)) {
        pairs.push([a, b])
      }
    }
  }

  return pairs
}

export function resolveCollisions(
  world: World,
  collisionDetector: (
    world: World,
  ) => [GameEntity, GameEntity][] = findCollisionsNaive,
): void {
  const pairs = collisionDetector(world)

  for (const [a, b] of pairs) {
    if (!a.alive || !b.alive) continue
    handleCollisionPair(world, a, b)
  }
}

function handleCollisionPair(world: World, a: GameEntity, b: GameEntity): void {
  let ship: Ship | null = null
  let bullet: Bullet | null = null
  let asteroid: Asteroid | null = null
  let pickup: Pickup | null = null

  const entities = [a, b]
  for (const e of entities) {
    if (e.kind === 'ship') {
      if (ship === null) ship = e
      else {
        handleShipVsShip(ship, e)
        return
      }
    } else if (e.kind === 'bullet') bullet = e
    else if (e.kind === 'asteroid') asteroid = e
    else if (e.kind === 'pickup') pickup = e
  }

  // 1. Куля влучає в астероїд
  if (bullet && asteroid) {
    bullet.destroy()
    const killed = asteroid.takeDamage(bullet.damage)
    world.emit?.('hit', {
      targetKind: 'asteroid',
      sourceKind: 'bullet',
      pos: asteroid.pos.clone(),
      damage: bullet.damage,
    })

    if (killed) {
      world.emit?.('exploded', {
        kind: 'asteroid',
        pos: asteroid.pos.clone(),
        tier: asteroid.tier,
      })

      const owner =
        bullet.ownerId !== null ? world.get(bullet.ownerId) : undefined
      if (owner?.kind === 'ship') {
        const ownerShip = owner
        const delta = asteroid.tier === 2 ? 100 : 50
        ownerShip.score += delta
        world.emit?.('score', {
          score: ownerShip.score,
          delta,
          pos: asteroid.pos.clone(),
        })
      }

      if (asteroid.tier === 2) {
        for (let i = 0; i < 2; i++) {
          const splitAngle = world.prng
            ? world.prng.random() * Math.PI * 2
            : i * Math.PI + 0.5
          const splitSpeed = world.prng ? 80 + world.prng.random() * 60 : 100
          const splitVel = Vector2.fromAngle(splitAngle, splitSpeed)
          world.spawn(
            new Asteroid({
              pos: asteroid.pos.add(Vector2.fromAngle(splitAngle, 12)),
              vel: asteroid.vel.scale(0.5).add(splitVel),
              tier: 1,
            }),
          )
        }
      }

      const shouldSpawnPickup = world.prng ? world.prng.random() < 0.4 : false
      if (shouldSpawnPickup && world.prng) {
        const types = [
          'shield',
          'rapid',
          'homing',
          'heal',
        ] satisfies PickupType[]
        const randomType =
          types[world.prng.randInt(0, types.length)] ?? 'shield'
        world.spawn(
          new Pickup({
            pos: asteroid.pos.clone(),
            vel: Vector2.fromAngle(world.prng.random() * Math.PI * 2, 20),
            type: randomType,
          }),
        )
      }
    }
    return
  }

  // 2. Куля влучає в корабель
  if (bullet && ship) {
    if (bullet.ownerId !== ship.id) {
      bullet.destroy()
      ship.takeDamage(bullet.damage)
      world.emit?.('hit', {
        targetKind: 'ship',
        sourceKind: 'bullet',
        pos: ship.pos.clone(),
        damage: bullet.damage,
      })

      if (!ship.alive) {
        world.emit?.('exploded', { kind: 'ship', pos: ship.pos.clone() })

        const shooter =
          bullet.ownerId !== null ? world.get(bullet.ownerId) : undefined
        if (shooter?.kind === 'ship') {
          const shooterShip = shooter
          shooterShip.score += 250
          world.emit?.('score', {
            score: shooterShip.score,
            delta: 250,
            pos: ship.pos.clone(),
          })
        }
      }
    }
    return
  }

  // 3. Корабель стикається з астероїдом
  if (ship && asteroid) {
    ship.takeDamage(35)
    const asteroidKilled = asteroid.takeDamage(30)
    world.emit?.('hit', {
      targetKind: 'ship',
      sourceKind: 'asteroid',
      pos: ship.pos.clone(),
      damage: 35,
    })

    const normal = ship.pos.sub(asteroid.pos).normalize()
    ship.vel = ship.vel.add(normal.scale(180))
    asteroid.vel = asteroid.vel.sub(normal.scale(100))

    if (!ship.alive) {
      world.emit?.('exploded', { kind: 'ship', pos: ship.pos.clone() })
    }
    if (asteroidKilled) {
      world.emit?.('exploded', {
        kind: 'asteroid',
        pos: asteroid.pos.clone(),
        tier: asteroid.tier,
      })
    }
    return
  }

  // 4. Корабель підбирає бонус
  if (ship && pickup) {
    pickup.collect(ship)
    ship.score += 50
    world.emit?.('pickup', { type: pickup.type, pos: pickup.pos.clone() })
    world.emit?.('score', {
      score: ship.score,
      delta: 50,
      pos: pickup.pos.clone(),
    })
    return
  }

  // 5. Зіткнення двох астероїдів
  if (a.kind === 'asteroid' && b.kind === 'asteroid') {
    const normal = a.pos.sub(b.pos).normalize()
    const relativeVel = a.vel.sub(b.vel)
    const velAlongNormal = relativeVel.dot(normal)
    if (velAlongNormal < 0) {
      const impulse = normal.scale(velAlongNormal)
      a.vel = a.vel.sub(impulse)
      b.vel = b.vel.add(impulse)
    }
  }
}

function handleShipVsShip(a: Ship, b: Ship): void {
  const normal = a.pos.sub(b.pos).normalize()
  const relativeVel = a.vel.sub(b.vel)
  const velAlongNormal = relativeVel.dot(normal)
  if (velAlongNormal < 0) {
    const impulse = normal.scale(velAlongNormal * 1.2)
    a.vel = a.vel.sub(impulse)
    b.vel = b.vel.add(impulse)
  }
}
