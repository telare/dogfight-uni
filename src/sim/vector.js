/**
 * Двовимірний вектор із чистими (immutable) методами.
 * Жоден чистий метод не мутує екземпляр або передані аргументи,
 * завжди повертаючи новий об'єкт Vector2.
 */
export class Vector2 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  /**
   * Додавання векторів: this + v
   * @param {Vector2} v
   * @returns {Vector2}
   */
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y)
  }

  /**
   * Віднімання векторів: this - v
   * @param {Vector2} v
   * @returns {Vector2}
   */
  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y)
  }

  /**
   * Множення вектора на скаляр: this * s
   * @param {number} s
   * @returns {Vector2}
   */
  scale(s) {
    return new Vector2(this.x * s, this.y * s)
  }

  /**
   * Скалярний добуток: this · v
   * @param {Vector2} v
   * @returns {number}
   */
  dot(v) {
    return this.x * v.x + this.y * v.y
  }

  /**
   * Довжина вектора (евклідова норма)
   * @returns {number}
   */
  length() {
    return Math.hypot(this.x, this.y)
  }

  /**
   * Квадрат довжини вектора (для швидких порівнянь відстаней без Math.sqrt)
   * @returns {number}
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y
  }

  /**
   * Одиничний вектор того ж напрямку (нормалізація)
   * @returns {Vector2}
   */
  normalize() {
    const len = this.length()
    if (len === 0) return new Vector2(0, 0)
    return new Vector2(this.x / len, this.y / len)
  }

  /**
   * Обертання вектора на кут rad (за годинниковою стрілкою)
   * @param {number} rad
   * @returns {Vector2}
   */
  rotate(rad) {
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos)
  }

  /**
   * Відстань між двома точками/векторами
   * @param {Vector2} v
   * @returns {number}
   */
  dist(v) {
    return this.sub(v).length()
  }

  /**
   * Квадрат відстані між двома точками/векторами
   * @param {Vector2} v
   * @returns {number}
   */
  distSq(v) {
    return this.sub(v).lengthSq()
  }

  /**
   * Створення копії вектора
   * @returns {Vector2}
   */
  clone() {
    return new Vector2(this.x, this.y)
  }

  /**
   * Створення вектора за кутом та довжиною
   * @param {number} angle - кут у радіанах
   * @param {number} [length=1] - довжина вектора
   * @returns {Vector2}
   */
  static fromAngle(angle, length = 1) {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length)
  }

  /**
   * Нульовий вектор (0, 0)
   * @returns {Vector2}
   */
  static zero() {
    return new Vector2(0, 0)
  }
}
