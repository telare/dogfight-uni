import { logger } from './logger.ts'
/**
 * Latency Injector (Lab 05 M1 & M3)
 * Штучне внесення мережевої затримки (latency), джиттеру (jitter)
 * та відсотка втрати пакетів (packet drop rate) для тестування netcode на localhost.
 */

export class LatencyInjector {
  latencyMs: number
  jitterMs: number
  dropRate: number
  droppedPacketsCount: number
  transmittedPacketsCount: number

  constructor({ latencyMs = 0, jitterMs = 0, dropRate = 0 } = {}) {
    this.latencyMs = Math.max(0, Number(latencyMs) || 0)
    this.jitterMs = Math.max(0, Number(jitterMs) || 0)
    this.dropRate = Math.max(0, Math.min(1, Number(dropRate) || 0))
    this.droppedPacketsCount = 0
    this.transmittedPacketsCount = 0
  }

  updateConfig({
    latencyMs,
    jitterMs,
    dropRate,
  }: Partial<Pick<LatencyInjector, 'latencyMs' | 'jitterMs' | 'dropRate'>>) {
    if (typeof latencyMs === 'number') this.latencyMs = Math.max(0, latencyMs)
    if (typeof jitterMs === 'number') this.jitterMs = Math.max(0, jitterMs)
    if (typeof dropRate === 'number')
      this.dropRate = Math.max(0, Math.min(1, dropRate))
  }

  getConfig() {
    return {
      latencyMs: this.latencyMs,
      jitterMs: this.jitterMs,
      dropRate: this.dropRate,
      droppedCount: this.droppedPacketsCount,
      transmittedCount: this.transmittedPacketsCount,
    }
  }

  /**
   * Відправка або виклик з урахуванням налаштованої затримки та втрати
   * @param {Function} deliverFn - функція фактичної доставки
   * @returns {boolean} true якщо пакет передано в доставку, false якщо скинуто (drop)
   */
  deliver(deliverFn: () => void) {
    if (this.dropRate > 0 && Math.random() < this.dropRate) {
      this.droppedPacketsCount++
      return false
    }

    this.transmittedPacketsCount++
    const halfRtt = this.latencyMs / 2
    const jitter =
      this.jitterMs > 0 ? (Math.random() * 2 - 1) * this.jitterMs : 0
    const delay = Math.max(0, Math.round(halfRtt + jitter))

    if (delay <= 1) {
      try {
        deliverFn()
      } catch (err) {
        logger.error({ event: 'latency.operation', err: err })
      }
    } else {
      setTimeout(() => {
        try {
          deliverFn()
        } catch (err) {
          logger.error({ event: 'latency.operation', err: err })
        }
      }, delay)
    }

    return true
  }
}
