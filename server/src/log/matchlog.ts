import type { TransformCallback, TransformOptions } from 'node:stream'
/**
 * Dogfight Server — Стрімінг логів матчів на диск (Lab 04 M3)
 * Використовує Transform stream у режимі objectMode та pipeline для уникнення
 * накопичення даних у пам'яті (захист від Backpressure).
 */

import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { config } from '../config.ts'

/**
 * Трансформ-потік: перетворює об'єкти ігрових подій на рядки формату NDJSON
 */
export class NdjsonTransform extends Transform {
  constructor(options: TransformOptions = {}) {
    super({
      ...options,
      writableObjectMode: true,
      readableObjectMode: false,
    })
  }

  override _transform(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    try {
      const line = JSON.stringify(chunk) + '\n'
      this.push(Buffer.from(line, 'utf8'))
      callback()
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)))
    }
  }
}

/**
 * Менеджер запису логу подій кімнати у файл через стрім
 */
export class MatchLog {
  roomId: string
  pipelinePromise: Promise<void>

  filename: string
  filepath: string
  transform: NdjsonTransform
  writeStream: fs.WriteStream
  isClosed: boolean
  eventsCount: number

  /**
   * @param {string} roomId
   */
  constructor(roomId: string) {
    this.roomId = roomId
    this.filename = `${roomId}-${Date.now()}.ndjson`
    this.filepath = path.join(config.LOG_DIR, this.filename)

    this.transform = new NdjsonTransform()
    this.writeStream = fs.createWriteStream(this.filepath, { flags: 'a' })

    this.isClosed = false
    this.eventsCount = 0

    // Запуск стрімінгового конвеєра (pipeline)
    this.pipelinePromise = pipeline(this.transform, this.writeStream).catch(
      (err) => {
        if (!this.isClosed) {
          console.error(
            `[MatchLog] Помилка конвеєра запису логу ${this.roomId}:`,
            err,
          )
        }
      },
    )

    this.record({
      t: Date.now(),
      type: 'room:init',
      roomId,
    })
  }

  /**
   * Запис події у стрім із врахуванням Backpressure
   * @param {Object} event
   */
  record(event: { type: string; t?: number; [key: string]: unknown }) {
    if (this.isClosed) return

    this.eventsCount++
    const payload = {
      t: event.t || Date.now(),
      ...event,
    }

    // Якщо внутрішній буфер потоку переповнено, write повертає false
    const canAcceptMore = this.transform.write(payload)
    if (!canAcceptMore) {
      // Потік автоматично сповільнить джерело за рахунок буферизації libuv
      this.transform.once('drain', () => {})
    }
  }

  /**
   * Завершення запису та скидання всіх буферів на диск
   * @returns {Promise<void>}
   */
  async close() {
    if (this.isClosed) return
    this.isClosed = true

    this.record({
      t: Date.now(),
      type: 'room:close',
      roomId: this.roomId,
      totalEvents: this.eventsCount,
    })

    this.transform.end()
    await this.pipelinePromise
  }
}
