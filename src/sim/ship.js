// Фізичні константи налаштовані на чуйне та плавне керування корабля:
// ROTATE_SPEED 3.6 — повний оберт займає ~1.75 с, що дає точність прицілювання.
// THRUST 520 — динамічний розгін за 0.5 с.
// DRAG 1.15 — опір середовища для стабілізації без газу.
// MAX_SPEED 380 — безпечна максимальна швидкість для роздільної здатності дисплея.
export const ROTATE_SPEED = 3.6
export const THRUST = 520
export const DRAG = 1.15
export const MAX_SPEED = 380

export function createShip({ x = 0, y = 0, angle = -Math.PI / 2 } = {}) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    thrust: 0,
  }
}

export function cloneShip(ship) {
  return {
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    angle: ship.angle,
    thrust: ship.thrust,
  }
}

/**
 * integrate — чиста функція фізики корабля.
 * Залежить лише від попереднього стану, введення та проміжку часу dt.
 * Не має жодних побічних ефектів, звернень до глобальних змінних, DOM чи Canvas.
 */
export function integrate(ship, input, dt) {
  const left = input.isDown('ArrowLeft') || input.isDown('KeyA')
  const right = input.isDown('ArrowRight') || input.isDown('KeyD')
  const thrusting = input.isDown('ArrowUp') || input.isDown('KeyW')

  if (left) ship.angle -= ROTATE_SPEED * dt
  if (right) ship.angle += ROTATE_SPEED * dt

  ship.thrust = thrusting ? THRUST : 0
  if (thrusting) {
    ship.vx += Math.cos(ship.angle) * THRUST * dt
    ship.vy += Math.sin(ship.angle) * THRUST * dt
  }

  // Експоненційне затухання швидкості (drag)
  const damp = Math.exp(-DRAG * dt)
  ship.vx *= damp
  ship.vy *= damp

  // Обмеження максимальної швидкості
  const speed = Math.hypot(ship.vx, ship.vy)
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed
    ship.vx *= scale
    ship.vy *= scale
  }

  ship.x += ship.vx * dt
  ship.y += ship.vy * dt
}
