/**
 * Dogfight Server — Конфігурація середовища (Lab 04)
 * Валідує та експортує змінні оточення process.env з дефолтними значеннями
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseServerConfig } from 'shared'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const parsedEnv = parseServerConfig(process.env)

export const config = {
  ...parsedEnv,
  LOG_DIR: path.resolve(rootDir, parsedEnv.LOG_DIR || 'logs'),
  CLIENT_DIST_DIR: path.resolve(rootDir, 'client', 'dist'),
}

// Забезпечуємо існування директорії для стрімінгу логів матчів
if (!fs.existsSync(config.LOG_DIR)) {
  fs.mkdirSync(config.LOG_DIR, { recursive: true })
}
