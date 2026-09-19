/**
 * Dogfight Server — Головний HTTP та WebSocket сервер на базі node:http (Lab 04)
 *
 * Особливості реалізації (Milestone 1, 2, 3, 4):
 * 1. Чистий node:http без важких фреймворків.
 * 2. Роздача статичних файлів client/dist із захистом від path-traversal та MIME-типами.
 * 3. REST API: GET/POST /api/rooms, GET /health, GET /api/slow (300ms busy-wait demo), GET /api/replays/:id.
 * 4. WebSocket сервер (/ws) з повним життєвим циклом, кімнатами, чатом та стрімінгом матч-логів.
 * 5. Безпечне завершення роботи процесу (Graceful Shutdown) на сигнали SIGINT/SIGTERM.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { RoomManager } from './rooms.js'
import { attachWebSocketServer } from './ws.js'
import { streamReplay } from './log/replay.js'

export const roomManager = new RoomManager()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ndjson': 'application/x-ndjson; charset=utf-8',
}

/**
 * Читання та валідація JSON тіла запиту із захистом від переповнення буфера
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=16384]
 * @returns {Promise<any>}
 */
function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    let body = ''
    let receivedBytes = 0

    req.on('data', (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > maxBytes) {
        req.destroy()
        reject(new Error('Payload Too Large'))
        return
      }
      body += chunk
    })

    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(new Error(`Invalid JSON syntax: ${err.message}`))
      }
    })

    req.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Роздача статичних файлів client/dist із захистом від path traversal
 */
function serveStaticFile(req, res, pathname) {
  let decodedPath = ''
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('400 Bad Request: Invalid URL encoding')
    return
  }

  // Нормалізація шляху відносно кореневої директорії client/dist
  const normalizedRelPath = path.normalize(decodedPath).replace(/^[/\\]+/, '')
  const targetPath = path.resolve(
    config.CLIENT_DIST_DIR,
    normalizedRelPath === '' ? 'index.html' : normalizedRelPath,
  )

  // Перевірка захисту від виходу за межі каталогу (Path Traversal Defense)
  if (
    !targetPath.startsWith(config.CLIENT_DIST_DIR + path.sep) &&
    targetPath !== config.CLIENT_DIST_DIR
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('403 Forbidden: Path Traversal Detected')
    return
  }

  // Якщо файл існує та це звичайний файл
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    const ext = path.extname(targetPath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control':
        ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })

    const readStream = fs.createReadStream(targetPath)
    readStream.pipe(res)
    return
  }

  // SPA fallback лише для HTML-навігації (без розширення файлу)
  const ext = path.extname(normalizedRelPath)
  if (!ext) {
    const indexPath = path.join(config.CLIENT_DIST_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      const readStream = fs.createReadStream(indexPath)
      readStream.pipe(res)
      return
    }
  }

  // Якщо файл не знайдено
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('404 Not Found')
}

/**
 * Головний обробник HTTP запитів
 */
export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url

  // 1. GET /health
  if (pathname === '/health' && req.method === 'GET') {
    const memory = process.memoryUsage()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        uptimeSec: Math.floor(process.uptime()),
        roomsCount: roomManager.count,
        rssMb: (memory.rss / 1024 / 1024).toFixed(2),
        heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(2),
        timestamp: Date.now(),
      }),
    )
    return
  }

  // 2. GET /api/rooms
  if (pathname === '/api/rooms' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    })
    res.end(JSON.stringify(roomManager.listRooms()))
    return
  }

  // 3. POST /api/rooms (Створення нової кімнати)
  if (pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 16384)
      const name = (body.name || '').trim().slice(0, 32)
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: "Field 'name' is required" }))
        return
      }

      const room = roomManager.createRoom({
        name,
        difficulty: body.difficulty || 'Normal',
        arena: body.arena || 'standard',
        maxPlayers: Number.parseInt(body.maxPlayers, 10) || 8,
        persistent: false,
      })

      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(room.toJSON()))
    } catch (err) {
      const status = err.message.includes('Payload Too Large') ? 413 : 400
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // 4. GET /api/slow (Демонстрація блокування однопотокового циклу подій M4)
  if (pathname === '/api/slow' && req.method === 'GET') {
    const delayMs = Number.parseInt(url.searchParams.get('ms') || '300', 10)
    console.log(
      `[EventLoop Block Demo] Початок блокуючого busy-wait на ${delayMs} мс...`,
    )
    const start = Date.now()
    // Штучний синхронний цикл, що повністю блокує потік Node.js
    while (Date.now() - start < delayMs) {
      /* блокування */
    }
    console.log(
      `[EventLoop Block Demo] Потік розблоковано через ${Date.now() - start} мс!`,
    )

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        message: 'Synchronous blocking completed',
        blockedMs: Date.now() - start,
      }),
    )
    return
  }

  // 5. GET /api/replays/:filename (Стрімінг повторів через pipeline)
  if (pathname.startsWith('/api/replays/') && req.method === 'GET') {
    const filename = path.basename(pathname.slice('/api/replays/'.length))
    const replayPath = path.join(config.LOG_DIR, filename)

    try {
      await streamReplay(replayPath, res)
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    }
    return
  }

  // 6. Роздача статичних файлів клієнта client/dist
  serveStaticFile(req, res, pathname)
})

// Прикріплюємо WebSocket сервер на шлях /ws
export const wss = attachWebSocketServer(server, { roomManager, config })

/**
 * Граційне завершення роботи (Graceful Shutdown)
 */
export async function gracefulShutdown(signal = 'SIGINT') {
  console.log(`\n[Server] Отримано сигнал ${signal}. Зупинка сервера...`)

  // 1. Припиняємо приймати нові HTTP з'єднання
  server.close(() => {
    console.log('[Server] HTTP сервер зупинено.')
  })

  // 2. Закриваємо всі WebSocket клієнти
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down')
  }

  // 3. Закриваємо та зберігаємо логи всіх кімнат
  await roomManager.closeAll()
  console.log('[Server] Усі кімнати та логи збережено.')

  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Запуск сервера, якщо файл виконується напряму
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  server.listen(config.PORT, config.HOST, () => {
    console.log(
      `%c[Dogfight Server] Запущено на http://${config.HOST}:${config.PORT} (WebSocket: ws://${config.HOST}:${config.PORT}/ws)`,
      'color: #38bdf8; font-weight: bold',
    )
    console.log(`[Dogfight Server] Логи матчів: ${config.LOG_DIR}`)
  })
}
