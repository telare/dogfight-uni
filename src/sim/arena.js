/**
 * Загортання позиції об'єкта при вильоті за межі арени.
 */
export function wrap(entity, width, height) {
  if (width <= 0 || height <= 0) return
  entity.x = ((entity.x % width) + width) % width
  entity.y = ((entity.y % height) + height) % height
}

/**
 * Якщо об'єкт перетнув межу екрана і телепортувався на протилежний бік,
 * попередній стан (previous) вирівнюється, щоб інтерполяція не тягнула
 * корабель через усе ігрове поле за 1 кадр.
 */
export function hideWrapForLerp(previous, current, width, height) {
  if (Math.abs(current.x - previous.x) > width / 2) {
    previous.x = current.x
  }
  if (Math.abs(current.y - previous.y) > height / 2) {
    previous.y = current.y
  }
}
