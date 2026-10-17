import { Vector2 } from './vector.js'

/**
 * Загортання позиції об'єкта при вильоті за межі арени.
 * @param {Object} entity
 * @param {number} width
 * @param {number} height
 */
export function wrap(entity, width, height) {
  if (width <= 0 || height <= 0) return

  if (entity.pos) {
    const x = ((entity.pos.x % width) + width) % width
    const y = ((entity.pos.y % height) + height) % height
    entity.pos = new Vector2(x, y)
  } else if (typeof entity.x === 'number') {
    entity.x = ((entity.x % width) + width) % width
    entity.y = ((entity.y % height) + height) % height
  }
}

/**
 * Виправлення розриву wrap для інтерполяції (Lerp).
 */
export function hideWrapForLerp(previous, current, width, height) {
  const prevX = previous.pos ? previous.pos.x : previous.x
  const prevY = previous.pos ? previous.pos.y : previous.y
  const currX = current.pos ? current.pos.x : current.x
  const currY = current.pos ? current.pos.y : current.y

  let newX = prevX
  let newY = prevY

  if (Math.abs(currX - prevX) > width / 2) {
    newX = currX > prevX ? prevX + width : prevX - width
  }
  if (Math.abs(currY - prevY) > height / 2) {
    newY = currY > prevY ? prevY + height : prevY - height
  }

  if (previous.pos) {
    previous.pos = new Vector2(newX, newY)
  } else {
    previous.x = newX
    previous.y = newY
  }
}
