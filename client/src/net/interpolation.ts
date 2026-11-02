import type { SnapshotData, EntityData } from 'shared'
/**
 * Dogfight Client — Entity Interpolation для віддалених гравців та сутностей (Lab 05 M3)
 *
 * Принцип роботи (Gabriel Gambetta Part 3 / Valve Source Netcode):
 * 1. Віддалені сутності приходять зі знімками сервера (30 Hz), але гра рендериться на 60–144 Hz.
 * 2. Малювання сутностей прямо у позиції останнього знімка дає сіпання (30 Hz stutter).
 * 3. Рішення: рендерити світ «у минулому» з буфера знімків на часовій позначці:
 *    renderTime = now - interpolationDelay (зазвичай 66-100 мс, ~2 інтервали знімків).
 * 4. Знаходимо два знімки s0 та s1, що обрамляють renderTime, та інтерполюємо (lerp):
 *    - Позицію з урахуванням тороїдального загортання арени (wrap).
 *    - Кут обертання за найкоротшою дугою кола (angle slerp).
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type RenderEntity = Mutable<EntityData> & { pos: { x: number; y: number } }

function normalizeAngle(a: number) {
  const tau = Math.PI * 2
  let res = ((a % tau) + tau) % tau
  if (res > Math.PI) res -= tau
  return res
}

function lerpAngle(a: number, b: number, t: number) {
  const diff = normalizeAngle(b - a)
  return a + diff * t
}

export class InterpolationManager {
  private lookup = new Map<number, EntityData>()
  private rendered = new Map<number, RenderEntity>()
  private output: RenderEntity[] = []
  private activeIds = new Set<number>()
  buffer: { arrivalTime: number; snapshot: SnapshotData }[]

  enabled: boolean
  interpolationDelayMs: number
  arenaWidth: number
  arenaHeight: number
  maxBufferSize: number

  constructor({
    interpolationDelayMs = 66,
    arenaWidth = 1200,
    arenaHeight = 800,
  } = {}) {
    this.enabled = true
    this.interpolationDelayMs = interpolationDelayMs
    this.arenaWidth = arenaWidth
    this.arenaHeight = arenaHeight

    // Буфер знімків: масив об'єктів { arrivalTime, snapshot }
    this.buffer = []
    this.maxBufferSize = 60 // ~2 секунди історії
  }

  reset() {
    this.lookup.clear()
    this.rendered.clear()
    this.output.length = 0
    this.activeIds.clear()
    this.buffer = []
  }

  /**
   * Додавання нового отриманого знімка сервера до буфера інтерполяції
   * @param {Object} snapshot
   */
  addSnapshot(snapshot: SnapshotData) {
    if (!snapshot) return
    const arrivalTime = performance.now()
    this.buffer.push({ arrivalTime, snapshot })

    // Тримаємо розмір буфера в межах maxBufferSize
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
    }
  }

  /**
   * Отримання інтерпольованого стану всіх віддалених сутностей для поточного кадру
   * @param {number} localShipId - ID корабля локального гравця (який виключається, бо він на prediction)
   * @param {number} [now=performance.now()]
   * @returns {Array<Object>}
   */
  getInterpolatedEntities(
    localShipId: number | null = null,
    now = performance.now(),
  ) {
    if (this.buffer.length === 0) {
      return []
    }

    // Якщо інтерполяцію вимкнено — малюємо стан останнього знімка («дурний клієнт»)
    if (!this.enabled || this.buffer.length === 1) {
      const latest = this.buffer[this.buffer.length - 1]!.snapshot
      return (latest.entities || []).filter((e) => e.id !== localShipId)
    }

    const renderTime = now - this.interpolationDelayMs

    // Шукаємо два сусідні знімки s0 та s1 навколо renderTime
    let s0 = null
    let s1 = null

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i]!.arrivalTime <= renderTime) {
        s0 = this.buffer[i]!
        s1 = this.buffer[i + 1] || null
        break
      }
    }

    // Якщо renderTime старіший за всі знімки у буфері — беремо найстаріший
    if (!s0) {
      s0 = this.buffer[0]!
      s1 = this.buffer[1] || s0
    }

    // Якщо renderTime новіший за всі знімки — беремо найновіший
    if (!s1) {
      const latest = this.buffer[this.buffer.length - 1]!.snapshot
      return (latest.entities || []).filter((e) => e.id !== localShipId)
    }

    const timeDelta = s1.arrivalTime - s0.arrivalTime
    const alpha =
      timeDelta > 0
        ? Math.max(0, Math.min(1, (renderTime - s0.arrivalTime) / timeDelta))
        : 1

    const s0Map = this.lookup
    s0Map.clear()
    for (const e of s0.snapshot.entities || []) {
      if (e.id !== localShipId) s0Map.set(e.id, e)
    }

    const interpolatedEntities = this.output
    interpolatedEntities.length = 0
    this.activeIds.clear()

    for (const e1 of s1.snapshot.entities || []) {
      if (e1.id === localShipId) continue

      this.activeIds.add(e1.id)
      let record = this.rendered.get(e1.id)
      if (!record || record.kind !== e1.kind) {
        record = { ...e1, pos: { x: e1.x, y: e1.y } }
        this.rendered.set(e1.id, record)
      }
      // Copy optional fields too; a kind change creates a fresh, consistent shape.
      Object.assign(record, e1)
      const e0 = s0Map.get(e1.id)
      if (e0) {
        // Інтерполюємо між e0 та e1
        let p0X = e0.x
        let p0Y = e0.y
        const p1X = e1.x
        const p1Y = e1.y

        // Обробка стрибка при тороїдальному загортанні (Arena Wrap)
        if (Math.abs(p1X - p0X) > this.arenaWidth / 2) {
          p0X = p1X > p0X ? p0X + this.arenaWidth : p0X - this.arenaWidth
        }
        if (Math.abs(p1Y - p0Y) > this.arenaHeight / 2) {
          p0Y = p1Y > p0Y ? p0Y + this.arenaHeight : p0Y - this.arenaHeight
        }

        const x = p0X + (p1X - p0X) * alpha
        const y = p0Y + (p1Y - p0Y) * alpha
        const angle = lerpAngle(e0.angle, e1.angle, alpha)

        record.x = ((x % this.arenaWidth) + this.arenaWidth) % this.arenaWidth
        record.y =
          ((y % this.arenaHeight) + this.arenaHeight) % this.arenaHeight
        record.angle = angle
      }
      record.pos.x = record.x
      record.pos.y = record.y
      interpolatedEntities.push(record)
    }
    // No entity survives in the cache after it leaves the rendered snapshot.
    for (const id of this.rendered.keys()) {
      if (!this.activeIds.has(id)) this.rendered.delete(id)
    }

    return interpolatedEntities
  }
}
