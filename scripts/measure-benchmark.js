import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAll } from '../src/assets/loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')

// Mock Web Audio Context & Image for Node.js
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class {
    constructor() {
      this._listeners = {}
    }
    addEventListener(evt, fn) {
      this._listeners[evt] = fn
    }
    removeEventListener(evt, fn) {
      delete this._listeners[evt]
    }
    set src(url) {
      if (url) {
        setTimeout(() => {
          this._listeners['load']?.()
        }, 20)
      }
    }
  }
}

const mockAudioContext = {
  decodeAudioData: (buffer, success) => {
    success({ duration: 0.3, numberOfChannels: 1, sampleRate: 44100 })
  },
}

// Запуск тестового HTTP-сервера зі штучною затримкою мережі 30 мс
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0]
  const filePath = path.join(publicDir, urlPath)

  setTimeout(() => {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      const mime =
        ext === '.json'
          ? 'application/json'
          : ext === '.png'
            ? 'image/png'
            : ext === '.wav'
              ? 'audio/wav'
              : 'text/plain'
      res.writeHead(200, { 'Content-Type': mime })
      res.end(fs.readFileSync(filePath))
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  }, 35) // 35ms network round-trip delay
})

server.listen(0, async () => {
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}`

  console.log(`HTTP сервер бенчмарку запущено на ${baseUrl}`)

  // Маніфест з абсолютними URL
  const manifest = {
    sprites: { sheet: `${baseUrl}/assets/sprites.png` },
    sounds: {
      laser: `${baseUrl}/assets/sounds/laser.wav`,
      hit: `${baseUrl}/assets/sounds/hit.wav`,
      explosion: `${baseUrl}/assets/sounds/explosion.wav`,
      pickup: `${baseUrl}/assets/sounds/pickup.wav`,
    },
    arena: `${baseUrl}/assets/arena.json`,
  }

  console.log('\n--- Прогін бенчмарку (3 ітерації) ---')
  const results = []

  for (let i = 1; i <= 3; i++) {
    // 1. Послідовно
    const t0Seq = performance.now()
    await loadAll(manifest, { ctx: mockAudioContext, sequential: true })
    const seqMs = performance.now() - t0Seq

    // 2. Паралельно (Promise.all)
    const t0Par = performance.now()
    await loadAll(manifest, { ctx: mockAudioContext, sequential: false })
    const parMs = performance.now() - t0Par

    const speedup = seqMs / parMs
    results.push({ run: i, seqMs, parMs, speedup })
    console.log(
      `Ітерація ${i}: Послідовно = ${seqMs.toFixed(1)} мс | Promise.all = ${parMs.toFixed(1)} мс | Прискорення: ${speedup.toFixed(2)}x`,
    )
  }

  const avgSeq = results.reduce((a, b) => a + b.seqMs, 0) / results.length
  const avgPar = results.reduce((a, b) => a + b.parMs, 0) / results.length
  const avgSpeedup = avgSeq / avgPar

  console.log('\n=== ПІДСУМОК БЕНЧМАРКУ ===')
  console.log(`Середній час sequential await:  ${avgSeq.toFixed(1)} мс`)
  console.log(`Середній час Promise.all:       ${avgPar.toFixed(1)} мс`)
  console.log(`Коефіцієнт прискорення:         ${avgSpeedup.toFixed(2)}x`)

  server.close()
})
