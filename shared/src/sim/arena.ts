import { Vector2 } from './vector.ts'

/**
 * Загортання позиції об'єкта при вильоті за межі арени.
 */
export function wrap(
  entity: { pos?: Vector2; x?: number; y?: number },
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return

  if (entity.pos) {
    const x = ((entity.pos.x % width) + width) % width
    const y = ((entity.pos.y % height) + height) % height
    entity.pos = new Vector2(x, y)
  } else if (typeof entity.x === 'number') {
    entity.x = ((entity.x % width) + width) % width
    entity.y = (((entity.y ?? 0) % height) + height) % height
  }
}

/**
 * Виправлення розриву wrap для інтерполяції (Lerp).
 */
export function hideWrapForLerp(
  previous: { pos?: Vector2; x?: number; y?: number },
  current: { pos?: Vector2; x?: number; y?: number },
  width: number,
  height: number,
): void {
  const prevX = previous.pos ? previous.pos.x : (previous.x ?? 0)
  const prevY = previous.pos ? previous.pos.y : (previous.y ?? 0)
  const currX = current.pos ? current.pos.x : (current.x ?? 0)
  const currY = current.pos ? current.pos.y : (current.y ?? 0)

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
