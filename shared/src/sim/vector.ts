/**
 * Незмінний (immutable) 2D вектор для фізичних розрахунків симуляції.
 * readonly поля гарантують незмінність — компілятор забороняє мутації.
 */
export class Vector2 {
  readonly x: number
  readonly y: number

  constructor(x = 0, y = 0) {
    this.x = Number(x) || 0
    this.y = Number(y) || 0
  }

  static zero(): Vector2 {
    return new Vector2(0, 0)
  }

  static fromAngle(angle: number, length = 1): Vector2 {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length)
  }

  static lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y)
  }

  sub(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y)
  }

  scale(factor: number): Vector2 {
    return new Vector2(this.x * factor, this.y * factor)
  }

  dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y
  }

  length(): number {
    return Math.sqrt(this.lengthSq())
  }

  normalize(): Vector2 {
    const len = this.length()
    if (len === 0) return Vector2.zero()
    return new Vector2(this.x / len, this.y / len)
  }

  distSq(other: Vector2): number {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return dx * dx + dy * dy
  }

  dist(other: Vector2): number {
    return Math.sqrt(this.distSq(other))
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y)
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y }
  }
}
