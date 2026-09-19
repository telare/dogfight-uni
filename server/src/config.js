/**
 * Dogfight Server — Конфігурація середовища (Lab 04)
 * Валідує та експортує змінні оточення process.env з дефолтними значеннями
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

export const config = {
  PORT: Number.parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_DIR: path.resolve(rootDir, process.env.LOG_DIR || 'logs'),
  CLIENT_DIST_DIR: path.resolve(rootDir, 'client', 'dist'),
  MAX_PAYLOAD_BYTES: Number.parseInt(
    process.env.MAX_PAYLOAD_BYTES || '32768',
    10,
  ), // 32 KB
  RATE_LIMIT_PER_SEC: Number.parseInt(
    process.env.RATE_LIMIT_PER_SEC || '15',
    10,
  ),
  HEARTBEAT_INTERVAL_MS: 15000,
  JOIN_TIMEOUT_MS: 5000,
  BUFFERED_AMOUNT_THRESHOLD: 65536, // 64 KB slow-client threshold
}

// Забезпечуємо існування директорії для стрімінгу логів матчів
if (!fs.existsSync(config.LOG_DIR)) {
  fs.mkdirSync(config.LOG_DIR, { recursive: true })
}
