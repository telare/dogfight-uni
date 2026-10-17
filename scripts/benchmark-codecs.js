/**
 * Lab 05 M4 — Benchmark: JSON vs Binary DataView Protocol
 *
 * Вимірює:
 * 1. Розмір одного знімка (Bytes/snapshot) для 4 гравців + 4 астероїди + 4 кулі (12 сутностей).
 * 2. Витрати трафіку від сервера до клієнта (KB/s per client down) при частоті 30 Hz.
 * 3. Розмір одного кадру введення (Bytes/input) та трафік до сервера (KB/s per client up).
 * 4. Час виконання кодування + декодування (Encode + Decode µs) на 10 000 ітераціях.
 */

import {
  encodeSnapshot,
  decodeSnapshot,
  encodeInput,
  decodeInput,
  encodeJsonSnapshot,
  decodeJsonSnapshot,
  encodeJsonInput,
  decodeJsonInput,
} from 'shared'

function runBenchmark() {
  console.log('='.repeat(70))
  console.log('  DOGFIGHT LAB 05 — BENCHMARK: JSON vs BINARY DATAVIEW PROTOCOL')
  console.log('='.repeat(70))

  // Створюємо тестовий знімок для матчу з 4 гравцями (12 сутностей)
  const sampleEntities = [
    // 4 Ships
    { id: 1, kind: 'ship', x: 200.5, y: 300.25, vx: 120.0, vy: -50.5, angle: 1.57, hp: 100, shield: 40, thrust: 1 },
    { id: 2, kind: 'ship', x: 800.0, y: 350.0, vx: -80.0, vy: 40.0, angle: 3.14, hp: 85, shield: 0, thrust: 0 },
    { id: 3, kind: 'ship', x: 500.5, y: 700.0, vx: 0.0, vy: -110.0, angle: -1.57, hp: 60, shield: 20, thrust: 1 },
    { id: 4, kind: 'ship', x: 600.0, y: 200.0, vx: 95.0, vy: 95.0, angle: 0.78, hp: 100, shield: 50, thrust: 1 },
    // 4 Asteroids
    { id: 5, kind: 'asteroid', x: 150.0, y: 150.0, vx: 20.0, vy: 15.0, angle: 0.5, tier: 2, hp: 60, shield: 0 },
    { id: 6, kind: 'asteroid', x: 900.0, y: 600.0, vx: -15.0, vy: -25.0, angle: 1.2, tier: 2, hp: 60, shield: 0 },
    { id: 7, kind: 'asteroid', x: 400.0, y: 400.0, vx: 35.0, vy: -10.0, angle: 2.1, tier: 1, hp: 25, shield: 0 },
    { id: 8, kind: 'asteroid', x: 750.0, y: 150.0, vx: -30.0, vy: 20.0, angle: 0.9, tier: 1, hp: 25, shield: 0 },
    // 4 Bullets
    { id: 9, kind: 'bullet', x: 220.0, y: 300.0, vx: 540.0, vy: 0.0, angle: 1.57, hp: 1, shield: 0, isHoming: false },
    { id: 10, kind: 'bullet', x: 780.0, y: 350.0, vx: -540.0, vy: 0.0, angle: 3.14, hp: 1, shield: 0, isHoming: false },
    { id: 11, kind: 'bullet', x: 500.0, y: 680.0, vx: 0.0, vy: -540.0, angle: -1.57, hp: 1, shield: 0, isHoming: true },
    { id: 12, kind: 'bullet', x: 620.0, y: 220.0, vx: 380.0, vy: 380.0, angle: 0.78, hp: 1, shield: 0, isHoming: false },
  ]

  const testSnapshot = {
    tick: 1500,
    serverTime: 1729000000,
    ackSeq: 420,
    entities: sampleEntities,
  }

  const testInput = {
    seq: 421,
    tick: 1501,
    thrust: 1,
    turn: 0.75,
    fire: true,
  }

  // 1. Розміри буферів
  const binSnapBuf = encodeSnapshot(testSnapshot)
  const jsonSnapBuf = encodeJsonSnapshot(testSnapshot)
  const binSnapBytes = binSnapBuf.byteLength
  const jsonSnapBytes = jsonSnapBuf.byteLength

  const binInputBuf = encodeInput(testInput)
  const jsonInputBuf = encodeJsonInput(testInput)
  const binInputBytes = binInputBuf.byteLength
  const jsonInputBytes = jsonInputBuf.byteLength

  // 2. Трафік на 30 Hz
  const TICK_RATE = 30
  const binDownKbps = ((binSnapBytes * TICK_RATE) / 1024).toFixed(2)
  const jsonDownKbps = ((jsonSnapBytes * TICK_RATE) / 1024).toFixed(2)

  const binUpKbps = ((binInputBytes * TICK_RATE) / 1024).toFixed(2)
  const jsonUpKbps = ((jsonInputBytes * TICK_RATE) / 1024).toFixed(2)

  // 3. Замір швидкодії (Encode + Decode µs) на 10,000 ітераціях
  const ITERATIONS = 10000

  // Warmup
  for (let i = 0; i < 500; i++) {
    decodeSnapshot(encodeSnapshot(testSnapshot))
    decodeJsonSnapshot(encodeJsonSnapshot(testSnapshot))
  }

  // Benchmark Binary DataView
  const startBin = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const enc = encodeSnapshot(testSnapshot)
    decodeSnapshot(enc)
  }
  const elapsedBinMs = performance.now() - startBin
  const binMicroSec = ((elapsedBinMs * 1000) / ITERATIONS).toFixed(2)

  // Benchmark JSON
  const startJson = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const enc = encodeJsonSnapshot(testSnapshot)
    decodeJsonSnapshot(enc)
  }
  const elapsedJsonMs = performance.now() - startJson
  const jsonMicroSec = ((elapsedJsonMs * 1000) / ITERATIONS).toFixed(2)

  console.log(`\nРезультати замірів при 30 Hz для 4 гравців (12 сутностей):\n`)

  const tableMarkdown = [
    '| Codec | Bytes/snapshot | KB/s per client (down) | KB/s per client (up) | Encode+decode µs |',
    '|---|---|---|---|---|',
    `| JSON | ${jsonSnapBytes} B | ${jsonDownKbps} KB/s | ${jsonUpKbps} KB/s | ${jsonMicroSec} µs |`,
    `| Binary (\`DataView\`) | ${binSnapBytes} B | ${binDownKbps} KB/s | ${binUpKbps} KB/s | ${binMicroSec} µs |`,
  ].join('\n')

  console.log(tableMarkdown)

  const compressionRatio = (jsonSnapBytes / binSnapBytes).toFixed(2)
  const speedupRatio = (parseFloat(jsonMicroSec) / parseFloat(binMicroSec)).toFixed(2)

  console.log(`\nВисновки бенчмарку:`)
  console.log(`• Економія трафіку знімків: бінарний протокол компактніший у ${compressionRatio}x рази (${binSnapBytes} B проти ${jsonSnapBytes} B).`)
  console.log(`• Економія трафіку вводу: ${binInputBytes} B проти ${jsonInputBytes} B.`)
  console.log(`• Продуктивність CPU: DataView швидший у ${speedupRatio}x разів (${binMicroSec} µs проти ${jsonMicroSec} µs), відсутній парсинг рядків!`)

  return {
    jsonSnapBytes,
    binSnapBytes,
    jsonDownKbps,
    binDownKbps,
    jsonUpKbps,
    binUpKbps,
    jsonMicroSec,
    binMicroSec,
    compressionRatio,
    speedupRatio,
    tableMarkdown,
  }
}

if (process.argv[1] && process.argv[1].endsWith('benchmark-codecs.js')) {
  runBenchmark()
}

export { runBenchmark }
