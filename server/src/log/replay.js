/**
 * Dogfight Server — Зчитування та стрімінг повторів матчів (Lab 04 M3)
 * Підтримує асинхронну ітерацію (for await) через createReadStream + readline
 * та безпосередній стрімінг клієнту через pipeline(readStream, res).
 */

import fs from 'node:fs'
import readline from 'node:readline'
import { pipeline } from 'node:stream/promises'

/**
 * Асинхронний генератор подій повтору матчу з файлу NDJSON
 * @param {string} filepath
 * @yields {Object}
 */
export async function* createReplayEvents(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Replay file not found: ${filepath}`)
  }

  const fileStream = fs.createReadStream(filepath, { encoding: 'utf8' })
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      yield JSON.parse(trimmed)
    } catch {
      // Ігноруємо пошкоджені рядки
    }
  }
}

/**
 * Стрімінг файлу повтору в HTTP-відповідь без завантаження всього файлу в оперативну пам'ять
 * @param {string} filepath
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<void>}
 */
export async function streamReplay(filepath, res) {
  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Replay not found' }))
    return
  }

  const stat = fs.statSync(filepath)
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  })

  const readStream = fs.createReadStream(filepath)
  await pipeline(readStream, res)
}
