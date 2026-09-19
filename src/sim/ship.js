import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { Bullet } from './bullet.js'
import { createHoming } from './components.js'

export const ROTATE_SPEED = 3.6
export const THRUST = 520
export const DRAG = 1.15
export const MAX_SPEED = 380

/**
 * Клас корабля гравця.
 * Успадковує Entity (глибина = 1).
 * Демонструє:
 * - Приватне поле #hp та публічний геттер get hp().
 * - Метод fire(world) для стрільби з носа корабля.
 * - Композицію поведінки бонусів (щит, скорострільність, самонавідні ракети).
 */
export class Ship extends Entity {
  #hp = 100

  /**
   * @param {Object} options
   * @param {Vector2} [options.pos]
   * @param {Vector2} [options.vel]
   * @param {number} [options.angle=-Math.PI / 2]
   */
  constructor({
    pos = Vector2.zero(),
    vel = Vector2.zero(),
    angle = -Math.PI / 2,
  } = {}) {
    super({
      pos,
      vel,
      angle,
      radius: 16,
      kind: 'ship',
    })

    this.maxHp = 100
    this.thrust = 0
    this.score = 0

    // Таймери та кулдауни
    this.fireCooldown = 0
    this.baseFireInterval = 0.2
    this.rapidFireTimer = 0
    this.homingTimer = 0

    // Силовий щит
    this.shield = 0
    this.shieldTimer = 0
  }

  /**
   * Поточний рівень здоров'я (доступ через приватне поле #hp)
   * @returns {number}
   */
  get hp() {
    return this.#hp
  }

  /**
   * Отримання шкоди з пріоритетним поглинанням щитом
   * @param {number} amount
   */
  takeDamage(amount) {
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

  /**
   * Відновлення здоров'я
   * @param {number} amount
   */
  heal(amount) {
    if (!this.alive) return
    this.#hp = Math.min(this.maxHp, this.#hp + amount)
  }

  /**
   * Активація енергетичного щита
   * @param {number} amount
   * @param {number} duration
   */
  addShield(amount, duration) {
    if (!this.alive) return
    this.shield = Math.min(100, this.shield + amount)
    this.shieldTimer = Math.max(this.shieldTimer, duration)
  }

  /**
   * Активація режиму швидкої стрільби
   * @param {number} duration
   */
  activateRapidFire(duration) {
    if (!this.alive) return
    this.rapidFireTimer = Math.max(this.rapidFireTimer, duration)
  }

  /**
   * Активація самонавідних ракет (композиція на кулі)
   * @param {number} duration
   */
  activateHomingMissiles(duration) {
    if (!this.alive) return
    this.homingTimer = Math.max(this.homingTimer, duration)
  }

  /**
   * Постріл з носа корабля.
   *
   * УВАГА ДЛЯ ЗАХИСТУ:
   * Якщо викликати цей метод напряму без контексту (наприклад:
   * document.addEventListener('click', ship.fire) або input.onFire(ship.fire)),
   * правило Default Binding встановить this = undefined (у суворому режимі класів ES6),
   * що призведе до помилки: TypeError: Cannot read properties of undefined.
   *
   * Три варіанти виправлення:
   * 1. Стрілочна функція: () => ship.fire(world)
   * 2. ship.fire.bind(ship, world)
   * 3. Оголошення fire як поля-стрілки: fire = (world) => { ... }
   *
   * @param {import('./world.js').World} world
   * @returns {Bullet|null}
   */
  fire(world) {
    if (!this.alive || this.fireCooldown > 0 || !world) {
      return null
    }

    // Розрахунок точки вильоту кулі з носа корабля
    const noseOffset = Vector2.fromAngle(this.angle, this.radius + 6)
    const spawnPos = this.pos.add(noseOffset)

    // Вектор швидкості кулі: успадкована швидкість корабля + вектор пострілу
    const bulletSpeed = 540
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, bulletSpeed))

    // Перевірка композиційного ефекту: якщо активні самонавідні ракети
    let homingComponent = null
    if (this.homingTimer > 0) {
      homingComponent = createHoming({
        targetKind: 'asteroid',
        turnRate: 5.5,
        speed: 480,
      })
    }

    const bullet = new Bullet({
      pos: spawnPos,
      vel: bulletVel,
      angle: this.angle,
      ttl: 1.4,
      damage: 40,
      ownerId: this.id,
      homing: homingComponent,
    })

    world.spawn(bullet)
    world.emit?.('fired', {
      kind: 'bullet',
      pos: spawnPos,
      ownerId: this.id,
      isHoming: Boolean(homingComponent),
    })

    // Встановлення інтервалу перезарядки (вдвічі швидше при активному rapidFire)
    const interval =
      this.rapidFireTimer > 0
        ? this.baseFireInterval * 0.45
        : this.baseFireInterval
    this.fireCooldown = interval

    return bullet
  }

  /**
   * Фізика переміщення та керування кораблем
   * @param {number} dt
   * @param {import('./world.js').World} world
   * @param {Object} input - об'єкт опитування введення
   */
  update(dt, world, input) {
    // Оновлення таймерів бафів та перезарядки
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

    if (input) {
      const left = input.isDown('ArrowLeft') || input.isDown('KeyA')
      const right = input.isDown('ArrowRight') || input.isDown('KeyD')
      const thrusting = input.isDown('ArrowUp') || input.isDown('KeyW')

      if (left) this.angle -= ROTATE_SPEED * dt
      if (right) this.angle += ROTATE_SPEED * dt

      this.thrust = thrusting ? THRUST : 0
      if (thrusting) {
        const thrustVec = Vector2.fromAngle(this.angle, THRUST * dt)
        this.vel = this.vel.add(thrustVec)
      }
    }

    // Експоненційне затухання швидкості (drag)
    const damp = Math.exp(-DRAG * dt)
    this.vel = this.vel.scale(damp)

    // Обмеження максимальної швидкості
    const speed = this.vel.length()
    if (speed > MAX_SPEED) {
      this.vel = this.vel.scale(MAX_SPEED / speed)
    }

    super.update(dt, world)
  }

  /**
   * Створення знімка стану для інтерполяції рендерингу (M1/Lab 1)
   */
  cloneState() {
    return {
      pos: this.pos.clone(),
      angle: this.angle,
      thrust: this.thrust,
      hp: this.#hp,
      shield: this.shield,
      alive: this.alive,
    }
  }

  /**
   * Респаун корабля у безпечній точці
   * @param {Vector2} safePos
   */
  respawn(safePos) {
    this.pos = safePos.clone()
    this.vel = Vector2.zero()
    this.angle = -Math.PI / 2
    this.#hp = this.maxHp
    this.alive = true
    this.thrust = 0
    this.fireCooldown = 0
    this.shield = 40
    this.shieldTimer = 3.0 // 3 секунди невразливості після відродження
  }
}
