import { wrap } from './arena.js'
import { resolveCollisions } from './collision.js'
import { Asteroid } from './asteroid.js'
import { Vector2 } from './vector.js'
import { createHoming } from './components.js'

/**
 * Керуючий менеджер сутностей (World).
 * Побудований поверх колекції Map<number, Entity>, що гарантує:
 * 1. Ключі залишаються числами (на відміну від об'єктів {} де ключі стають рядками).
 * 2. Відсутність конфліктів з прототипними властивостями Object.prototype (toString, constructor).
 * 3. Ефективні O(1) операції додавання, пошуку та видалення за id.
 * 4. Збереження порядку вставки та вбудований розмір .size.
 */
export class World extends EventTarget {
  #entities = new Map()

  /** @type {import('./ship.js').Ship|null} */
  playerShip = null

  #respawnTimer = 0

  arenaWidth = 1200
  arenaHeight = 800

  constructor({ width = 1200, height = 800 } = {}) {
    super()
    this.arenaWidth = width
    this.arenaHeight = height
  }

  /**
   * Диспетчеризація CustomEvent через вбудований EventTarget.
   * Дозволяє розчепити фізику/симуляцію від аудіо та HUD.
   *
   * @param {string} type - назва події ('fired', 'hit', 'exploded', 'pickup', 'score', 'respawn')
   * @param {any} [detail] - корисне навантаження події
   */
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  /**
   * Кількість активних сутностей у світі
   * @returns {number}
   */
  get size() {
    return this.#entities.size
  }

  /**
   * Отримання таймера відродження гравця
   * @returns {number}
   */
  get respawnTimer() {
    return this.#respawnTimer
  }

  /**
   * Додавання сутності до світу.
   * @param {import('./entity.js').Entity} entity
   * @returns {import('./entity.js').Entity}
   */
  spawn(entity) {
    if (!entity || typeof entity.id !== 'number') {
      throw new Error('World.spawn: Entity must have a valid numeric #id')
    }
    this.#entities.set(entity.id, entity)
    return entity
  }

  /**
   * Відкладене видалення сутності.
   * Позначає сутність прапорцем alive = false.
   * Фактичне видалення з Map відбувається у фазі sweep наприкінці кроку,
   * що запобігає багам мутації колекції під час ітерації.
   *
   * @param {number} id
   */
  despawn(id) {
    const entity = this.#entities.get(id)
    if (entity) {
      entity.alive = false
    }
  }

  /**
   * Пошук сутності за id
   * @param {number} id
   * @returns {import('./entity.js').Entity|undefined}
   */
  get(id) {
    return this.#entities.get(id)
  }

  /**
   * Реалізація ітерованого протоколу (Iterable).
   * Дозволяє обходити світ через for (const entity of world).
   */
  *[Symbol.iterator]() {
    yield* this.#entities.values()
  }

  /**
   * Генератор сутностей зазначеного типу.
   * Працює ліниво (lazy evaluation), не створюючи проміжних масивів у пам'яті.
   *
   * @param {string} kind
   * @yields {import('./entity.js').Entity}
   */
  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind) {
        yield entity
      }
    }
  }

  /**
   * Пошук безпечної точки для появи без накладання на астероїди
   * @param {number} [radius=40]
   * @returns {Vector2}
   */
  findSafeSpawnPos(radius = 40) {
    const margin = 100
    for (let attempts = 0; attempts < 25; attempts++) {
      const candidate = new Vector2(
        margin + Math.random() * (this.arenaWidth - margin * 2),
        margin + Math.random() * (this.arenaHeight - margin * 2),
      )

      let safe = true
      for (const asteroid of this.ofKind('asteroid')) {
        if (
          candidate.distSq(asteroid.pos) <
          (asteroid.radius + radius + 70) ** 2
        ) {
          safe = false
          break
        }
      }

      if (safe) return candidate
    }

    return new Vector2(this.arenaWidth / 2, this.arenaHeight / 2)
  }

  /**
   * Спавн демонстраційного астероїда-мисливця (Homing Asteroid через композицію)
   */
  spawnHomingAsteroid() {
    const pos = this.findSafeSpawnPos(30)
    const asteroid = new Asteroid({
      pos,
      vel: Vector2.zero(),
      tier: 2,
      homing: createHoming({
        targetKind: 'ship',
        turnRate: 2.2,
        speed: 160,
      }),
    })
    this.spawn(asteroid)
    return asteroid
  }

  /**
   * Головний крок оновлення симуляції світу.
   * 1. Оновлення всіх сутностей.
   * 2. Перевірка меж арени (wrap).
   * 3. Розрахунок колізій (окрема система).
   * 4. Відкладене прибирання мертвих (sweep).
   * 5. Обробка відродження гравця (respawn).
   *
   * @param {number} dt - дельта часу в секундах
   * @param {Object} [inputs] - стан клавіатури/керування
   */
  step(dt, inputs) {
    // 1. Оновлення сутностей
    for (const entity of this.#entities.values()) {
      if (entity.alive) {
        entity.update(dt, this, inputs)
        // Загортання координат за межі екрана
        wrap(entity, this.arenaWidth, this.arenaHeight)
      }
    }

    // 2. Обробка зіткнень
    resolveCollisions(this)

    // 3. Відкладене очищення (Sweep)
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        this.#entities.delete(id)
      }
    }

    // 4. Логіка таймера відродження гравця через 2 секунди
    if (this.playerShip && !this.playerShip.alive) {
      if (this.#respawnTimer <= 0) {
        this.#respawnTimer = 2.0 // рівно 2 секунди за специфікацією лаби
      }
      this.#respawnTimer -= dt
      if (this.#respawnTimer <= 0) {
        this.#respawnTimer = 0
        const safePos = this.findSafeSpawnPos(this.playerShip.radius)
        this.playerShip.respawn(safePos)
        this.spawn(this.playerShip)
        this.emit('respawn', { pos: safePos.clone() })
      }
    }

    // 5. Підтримка популяції астероїдів у світі
    let asteroidCount = 0
    for (const a of this.ofKind('asteroid')) {
      if (a.alive) asteroidCount++
    }

    if (asteroidCount < 4) {
      this.#spawnRandomAsteroid()
    }
  }

  /**
   * Створення нового фонового астероїда біля краю арени
   */
  #spawnRandomAsteroid() {
    const side = Math.floor(Math.random() * 4)
    let x = 0
    let y = 0
    if (side === 0) {
      x = Math.random() * this.arenaWidth
      y = 0
    } else if (side === 1) {
      x = this.arenaWidth
      y = Math.random() * this.arenaHeight
    } else if (side === 2) {
      x = Math.random() * this.arenaWidth
      y = this.arenaHeight
    } else {
      x = 0
      y = Math.random() * this.arenaHeight
    }

    const angle = Math.random() * Math.PI * 2
    const speed = 40 + Math.random() * 60

    const asteroid = new Asteroid({
      pos: new Vector2(x, y),
      vel: Vector2.fromAngle(angle, speed),
      tier: 2,
    })
    this.spawn(asteroid)
  }
}
