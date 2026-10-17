/**
 * Незмінний (immutable) 2D вектор для фізичних розрахунків симуляції.
 */
export class Vector2 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x = 0, y = 0) {
    this.x = Number(x) || 0
    this.y = Number(y) || 0
  }

  static zero() {
    return new Vector2(0, 0)
  }

  static fromAngle(angle, length = 1) {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length)
  }

  static lerp(a, b, t) {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y)
  }

  sub(other) {
    return new Vector2(this.x - other.x, this.y - other.y)
  }

  scale(factor) {
    return new Vector2(this.x * factor, this.y * factor)
  }

  dot(other) {
    return this.x * other.x + this.y * other.y
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y
  }

  length() {
    return Math.sqrt(this.lengthSq())
  }

  normalize() {
    const len = this.length()
    if (len === 0) return Vector2.zero()
    return new Vector2(this.x / len, this.y / len)
  }

  distSq(other) {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return dx * dx + dy * dy
  }

  dist(other) {
    return Math.sqrt(this.distSq(other))
  }

  clone() {
    return new Vector2(this.x, this.y)
  }

  toJSON() {
    return { x: this.x, y: this.y }
  }
}
