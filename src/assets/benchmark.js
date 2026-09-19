/**
 * Dogfight — Бенчмарк асинхронного завантаження (Lab 03)
 * Порівняння: послідовний await проти паралельного Promise.all
 */

import { loadAll } from './loader.js'

/**
 * Замір часу виконання послідовного та конкурентного завантаження
 * @param {Object} [options]
 * @param {string} [options.manifestUrl='/assets/manifest.json']
 * @param {AudioContext} [options.ctx]
 * @param {number} [options.runs=3]
 * @returns {Promise<{ seqAvgMs: number, parAvgMs: number, speedupFactor: number, runs: Array<any> }>}
 */
export async function runAssetBenchmark({
  manifestUrl = '/assets/manifest.json',
  ctx,
  runs = 3,
} = {}) {
  console.log(
    `%c=== [Lab 03] Запуск бенчмарку завантаження (${runs} ітерацій) ===`,
    'color: #38bdf8; font-weight: bold',
  )

  const results = []

  for (let i = 1; i <= runs; i++) {
    // 1. Послідовний режим (sequential await)
    const t0Seq = performance.now()
    await loadAll(manifestUrl, { ctx, sequential: true })
    const seqDuration = performance.now() - t0Seq

    // 2. Паралельний режим (Promise.all)
    const t0Par = performance.now()
    await loadAll(manifestUrl, { ctx, sequential: false })
    const parDuration = performance.now() - t0Par

    const speedup = seqDuration / (parDuration || 1)
    results.push({ run: i, seqDuration, parDuration, speedup })

    console.log(
      `Прогін #${i}: Послідовно = ${seqDuration.toFixed(2)} мс | Promise.all = ${parDuration.toFixed(2)} мс | Прискорення = ${speedup.toFixed(2)}x`,
    )
  }

  const seqAvgMs =
    results.reduce((acc, r) => acc + r.seqDuration, 0) / results.length
  const parAvgMs =
    results.reduce((acc, r) => acc + r.parDuration, 0) / results.length
  const speedupFactor = seqAvgMs / (parAvgMs || 1)

  console.log(
    `%c=== Середній результат: Послідовно: ${seqAvgMs.toFixed(2)} мс vs Promise.all: ${parAvgMs.toFixed(2)} мс (${speedupFactor.toFixed(2)}x швидше) ===`,
    'color: #4ade80; font-weight: bold',
  )

  return { seqAvgMs, parAvgMs, speedupFactor, runs: results }
}
