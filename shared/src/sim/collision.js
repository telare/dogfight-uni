import { Asteroid } from './asteroid.js'
import { Pickup } from './pickup.js'
import { Vector2 } from './vector.js'

export function circlesIntersect(posA, radiusA, posB, radiusB) {
  const rSum = radiusA + radiusB
  return posA.distSq(posB) <= rSum * rSum
}

export function findCollisionsNaive(world) {
  const entities = Array.from(world)
  const len = entities.length
  const pairs = []

  for (let i = 0; i < len; i++) {
    const a = entities[i]
    if (!a.alive || a.radius <= 0) continue

    for (let j = i + 1; j < len; j++) {
      const b = entities[j]
      if (!b.alive || b.radius <= 0) continue

      if (circlesIntersect(a.pos, a.radius, b.pos, b.radius)) {
        pairs.push([a, b])
      }
    }
  }

  return pairs
}

export function resolveCollisions(
  world,
  collisionDetector = findCollisionsNaive,
) {
  const pairs = collisionDetector(world)

  for (const [a, b] of pairs) {
    if (!a.alive || !b.alive) continue
    handleCollisionPair(world, a, b)
  }
}

function handleCollisionPair(world, a, b) {
  let ship = null
  let bullet = null
  let asteroid = null
  let pickup = null

  const entities = [a, b]
  for (const e of entities) {
    if (e.kind === 'ship') {
      if (ship === null) ship = e
      else {
        // Two ships colliding
        handleShipVsShip(world, a, b)
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

      const owner = world.get(bullet.ownerId)
      if (owner && owner.kind === 'ship') {
        const delta = asteroid.tier === 2 ? 100 : 50
        owner.score += delta
        world.emit?.('score', {
          score: owner.score,
          delta,
          pos: asteroid.pos.clone(),
        })
      }

      // Якщо великий астероїд — розпадається на 2 менших (детерміновано через PRNG світу)
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

      // Шанс випадання бонусу
      const shouldSpawnPickup = world.prng ? world.prng.random() < 0.4 : false
      if (shouldSpawnPickup) {
        const types = ['shield', 'rapid', 'homing', 'heal']
        const randomType = types[world.prng.randInt(0, types.length)]
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
        world.emit?.('exploded', {
          kind: 'ship',
          pos: ship.pos.clone(),
        })

        const shooter = world.get(bullet.ownerId)
        if (shooter && shooter.kind === 'ship') {
          shooter.score += 250
          world.emit?.('score', {
            score: shooter.score,
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
      world.emit?.('exploded', {
        kind: 'ship',
        pos: ship.pos.clone(),
      })
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
    world.emit?.('pickup', {
      type: pickup.type,
      pos: pickup.pos.clone(),
    })
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

function handleShipVsShip(world, a, b) {
  const normal = a.pos.sub(b.pos).normalize()
  const relativeVel = a.vel.sub(b.vel)
  const velAlongNormal = relativeVel.dot(normal)
  if (velAlongNormal < 0) {
    const impulse = normal.scale(velAlongNormal * 1.2)
    a.vel = a.vel.sub(impulse)
    b.vel = b.vel.add(impulse)
  }
}
