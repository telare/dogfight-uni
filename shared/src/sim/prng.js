/**
 * Mulberry32 — швидкий 32-бітний псевдовипадковий генератор (PRNG).
 * Гарантує 100% однаковий потік псевдовипадкових чисел у браузері та Node.js
 * за умови однакового початкового seed (детермінізм симуляції).
 */

export function mulberry32(seed) {
  let s = seed >>> 0 || 1
  return function next() {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class PRNG {
  constructor(seed = 123456789) {
    this.seed = seed >>> 0 || 1
    this.next = mulberry32(this.seed)
  }

  random() {
    return this.next()
  }

  range(min, max) {
    return min + this.random() * (max - min)
  }

  randInt(min, max) {
    return Math.floor(this.range(min, max))
  }

  fork() {
    return new PRNG(this.randInt(1, 0x7fffffff))
  }
}
