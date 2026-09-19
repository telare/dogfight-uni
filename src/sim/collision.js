import { Explosion } from './explosion.js'
import { Asteroid } from './asteroid.js'
import { Pickup } from './pickup.js'
import { Vector2 } from './vector.js'

/**
 * Перевірка перетину двох кіл
 * @param {import('./vector.js').Vector2} posA
 * @param {number} radiusA
 * @param {import('./vector.js').Vector2} posB
 * @param {number} radiusB
 * @returns {boolean}
 */
export function circlesIntersect(posA, radiusA, posB, radiusB) {
  const rSum = radiusA + radiusB
  return posA.distSq(posB) <= rSum * rSum
}

/**
 * Наївний пошук усіх пар зіткнень зі складністю O(n²).
 * Виділений в окрему систему, щоб у Лабораторній 7 його можна було замінити
 * на Spatial Hash без переписування логіки гри.
 *
 * @param {import('./world.js').World} world
 * @returns {Array<[import('./entity.js').Entity, import('./entity.js').Entity]>}
 */
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

/**
 * Система обробки зіткнень та взаємодії сутностей.
 * @param {import('./world.js').World} world
 * @param {Function} [collisionDetector=findCollisionsNaive]
 */
export function resolveCollisions(
  world,
  collisionDetector = findCollisionsNaive,
) {
  const pairs = collisionDetector(world)

  for (const [a, b] of pairs) {
    if (!a.alive || !b.alive) continue

    // Впорядковуємо за типами для простоти обробки (kindA, kindB)
    handleCollisionPair(world, a, b)
  }
}

/**
 * Диспетчеризація пари зіткнення за їхніми типами
 */
function handleCollisionPair(world, a, b) {
  let ship = null
  let bullet = null
  let asteroid = null
  let pickup = null

  const entities = [a, b]
  for (const e of entities) {
    if (e.kind === 'ship') ship = e
    else if (e.kind === 'bullet') bullet = e
    else if (e.kind === 'asteroid') asteroid = e
    else if (e.kind === 'pickup') pickup = e
  }

  // 1. Куля влучає в астероїд
  if (bullet && asteroid) {
    bullet.destroy()
    const killed = asteroid.takeDamage(bullet.damage)

    if (killed) {
      // Спавн вибуху
      world.spawn(
        new Explosion({
          pos: asteroid.pos,
          count: asteroid.tier === 2 ? 30 : 16,
          style: 'asteroid',
        }),
      )

      // Нарахування очок власнику кулі
      const owner = world.get(bullet.ownerId)
      if (owner && owner.kind === 'ship') {
        owner.score += asteroid.tier === 2 ? 100 : 50
      }

      // Якщо великий астероїд — розпадається на 2 менших
      if (asteroid.tier === 2) {
        for (let i = 0; i < 2; i++) {
          const splitAngle = Math.random() * Math.PI * 2
          const splitVel = Vector2.fromAngle(
            splitAngle,
            80 + Math.random() * 60,
          )
          world.spawn(
            new Asteroid({
              pos: asteroid.pos.add(Vector2.fromAngle(splitAngle, 12)),
              vel: asteroid.vel.scale(0.5).add(splitVel),
              tier: 1,
            }),
          )
        }
      }

      // Шанс випадання корисного бонусу (Pickup)
      if (Math.random() < 0.4) {
        const types = ['shield', 'rapid', 'homing', 'heal']
        const randomType = types[Math.floor(Math.random() * types.length)]
        world.spawn(
          new Pickup({
            pos: asteroid.pos.clone(),
            vel: Vector2.fromAngle(Math.random() * Math.PI * 2, 20),
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
      if (!ship.alive) {
        world.spawn(
          new Explosion({
            pos: ship.pos,
            count: 45,
            style: 'ship',
          }),
        )
      }
    }
    return
  }

  // 3. Корабель стикається з астероїдом
  if (ship && asteroid) {
    ship.takeDamage(35)
    const asteroidKilled = asteroid.takeDamage(30)

    // Фізичне відштовхування (пружний імпульс)
    const normal = ship.pos.sub(asteroid.pos).normalize()
    ship.vel = ship.vel.add(normal.scale(180))
    asteroid.vel = asteroid.vel.sub(normal.scale(100))

    if (!ship.alive) {
      world.spawn(
        new Explosion({
          pos: ship.pos,
          count: 45,
          style: 'ship',
        }),
      )
    }

    if (asteroidKilled) {
      world.spawn(
        new Explosion({
          pos: asteroid.pos,
          count: asteroid.tier === 2 ? 30 : 16,
          style: 'asteroid',
        }),
      )
    }
    return
  }

  // 4. Корабель підбирає бонус (Pickup)
  if (ship && pickup) {
    pickup.collect(ship)
    ship.score += 50
    // Невеличкий спалах частинок при підборі
    world.spawn(
      new Explosion({
        pos: pickup.pos,
        count: 12,
        style: 'ship',
      }),
    )
    return
  }

  // 5. Зіткнення двох астероїдів (пружний відскок)
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
