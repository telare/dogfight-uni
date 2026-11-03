import type { IncomingMessage, ServerResponse } from 'node:http'
import { CreateRoomSchema } from 'shared'
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
import { performance } from 'node:perf_hooks'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger } from './logger.ts'
import { metrics, renderMetrics } from './metrics.ts'
import { config } from './config.ts'
import { RoomManager } from './rooms.ts'
import { attachWebSocketServer } from './ws.ts'
import { streamReplay } from './log/replay.ts'

export function createApplication() {
  const roomManager = new RoomManager()
  let draining = false
  let shutdownPromise: Promise<void> | undefined

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.ndjson': 'application/x-ndjson; charset=utf-8',
  }

  /**
   * Читання та валідація JSON тіла запиту із захистом від переповнення буфера
   * @param {import('node:http').IncomingMessage} req
   * @param {number} [maxBytes=16384]
   * @returns {Promise<unknown>}
   */
  function readJsonBody(
    req: IncomingMessage,
    maxBytes = 16384,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = ''
      let receivedBytes = 0

      req.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
        if (receivedBytes > maxBytes) {
          req.destroy()
          reject(new Error('Payload Too Large'))
          return
        }
        body += chunk.toString()
      })

      req.on('end', () => {
        if (!body) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(
            new Error(
              `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
            ),
          )
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
  function serveStaticFile(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ) {
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
          targetPath.includes(path.sep + 'assets' + path.sep) &&
          /-[\w-]{8,}\./.test(targetPath)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
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
  async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host || 'localhost'}`,
    )
    const { pathname } = url
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (pathname === '/ready') {
      const ready =
        !draining &&
        fs.existsSync(path.join(config.CLIENT_DIST_DIR, 'index.html'))
      res.writeHead(ready ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({ ready, version: config.BUILD_SHA }))
      return
    }
    if (draining && pathname !== '/health') {
      res.writeHead(503)
      res.end('Server restarting')
      return
    }
    if (pathname === '/metrics') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-store',
      })
      res.end(renderMetrics(roomManager))
      return
    }
    if (
      !config.ENABLE_DIAGNOSTICS &&
      (pathname === '/api/slow' ||
        pathname.startsWith('/api/replays/') ||
        pathname.endsWith('/bots'))
    ) {
      res.writeHead(404)
      res.end()
      return
    }

    // 1. GET /health
    if (pathname === '/health' && req.method === 'GET') {
      const memory = process.memoryUsage()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          version: config.BUILD_SHA,
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
    const botRoute = /^\/api\/rooms\/([^/]+)\/bots$/.exec(pathname)
    if (botRoute && req.method === 'POST') {
      const room = roomManager.getRoom(botRoute[1] ?? '')
      if (!room) {
        res.writeHead(404)
        res.end()
        return
      }
      try {
        const body = await readJsonBody(req)
        if (
          typeof body !== 'object' ||
          body === null ||
          !('count' in body) ||
          typeof body.count !== 'number'
        )
          throw new Error('Expected { count: integer }')
        const bots = room.match.addBots(body.count)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ bots }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
      return
    }
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
        const parsed = CreateRoomSchema.safeParse(
          await readJsonBody(req, 16384),
        )
        if (!parsed.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: parsed.error.message }))
          return
        }
        const room = roomManager.createRoom({
          ...parsed.data,
          persistent: false,
        })

        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(room.toJSON()))
      } catch (err) {
        const status = (err instanceof Error
          ? err.message
          : String(err)
        ).includes('Payload Too Large')
          ? 413
          : 400
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
      return
    }

    // 3.1. GET /api/stats (Діагностика тіків, тривалості та джиттеру Lab 05)
    if (pathname === '/api/stats' && req.method === 'GET') {
      const memory = process.memoryUsage()
      const roomsStats = roomManager.listRooms().map((r) => ({
        id: r.id,
        name: r.name,
        players: r.players,
        stats: r.stats,
      }))

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      })
      res.end(
        JSON.stringify({
          version: config.BUILD_SHA,
          status: 'ok',
          uptimeSec: Math.floor(process.uptime()),
          roomsCount: roomManager.count,
          rssMb: (memory.rss / 1024 / 1024).toFixed(2),
          heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(2),
          rooms: roomsStats,
          eventLoopUtilization: performance.eventLoopUtilization(),
          timestamp: Date.now(),
        }),
      )
      return
    }

    // 4. GET /api/slow (Демонстрація блокування однопотокового циклу подій M4)
    if (pathname === '/api/slow' && req.method === 'GET') {
      const delayMs = Number.parseInt(url.searchParams.get('ms') || '300', 10)
      logger.debug({ event: 'index.operation' })
      const start = Date.now()
      // Штучний синхронний цикл, що повністю блокує потік Node.js
      while (Date.now() - start < delayMs) {
        /* блокування */
      }
      logger.debug({ event: 'index.operation' })

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
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }
      return
    }

    // 6. Роздача статичних файлів клієнта client/dist
    serveStaticFile(req, res, pathname)
  }
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      logger.error({ event: 'http.error', err: error })
      if (!res.headersSent) res.writeHead(500)
      res.end('Internal Server Error')
    })
  })

  // Прикріплюємо WebSocket сервер на шлях /ws
  const wss = attachWebSocketServer(server, {
    roomManager,
    config,
    isDraining: () => draining,
  })

  /**
   * Граційне завершення роботи (Graceful Shutdown)
   */
  function gracefulShutdown(signal = 'SIGTERM'): Promise<void> {
    if (shutdownPromise) return shutdownPromise
    draining = true
    logger.info({ event: 'server.draining', signal })
    shutdownPromise = (async () => {
      const deadline = setTimeout(() => {
        for (const socket of wss.clients) socket.terminate()
        server.closeAllConnections()
      }, config.SHUTDOWN_TIMEOUT_MS)
      const httpClosed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      )
      for (const socket of wss.clients) {
        if (socket.readyState === 1)
          socket.send(
            JSON.stringify({
              type: 'shutdown',
              message: 'Server restarting. Reconnect from the lobby.',
            }),
          )
        socket.close(1001, 'Server restarting')
      }
      const wsClosed = new Promise<void>((resolve) =>
        wss.close(() => resolve()),
      )
      try {
        await Promise.all([httpClosed, wsClosed, roomManager.closeAll()])
        logger.info({ event: 'server.stopped' })
        await new Promise<void>((resolve, reject) =>
          logger.flush((error) => (error ? reject(error) : resolve())),
        )
      } finally {
        clearTimeout(deadline)
      }
    })()
    return shutdownPromise
  }
  return { server, wss, roomManager, gracefulShutdown, metrics }
}

// Backward-compatible singleton for the existing lab tools. Importing installs no process handlers.
export const { server, wss, roomManager, gracefulShutdown } =
  createApplication()

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  let failed = false
  let hardStop: ReturnType<typeof setTimeout> | undefined
  const stop = (signal: string) => {
    hardStop ??= setTimeout(() => {
      logger.fatal({ event: 'shutdown.deadline' })
      process.exit(1)
    }, config.SHUTDOWN_TIMEOUT_MS + 500)
    hardStop.unref()
    void gracefulShutdown(signal)
      .then(() => {
        clearTimeout(hardStop)
      })
      .catch((err: unknown) => {
        logger.fatal({ event: 'shutdown.failed', err })
        process.exitCode = 1
      })
  }
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => stop(signal))
  const crash = (err: unknown) => {
    if (failed) process.exit(1)
    failed = true
    logger.fatal({
      event: 'process.crash',
      err: err instanceof Error ? err : new Error(String(err)),
    })
    process.exitCode = 1
    const deadline = setTimeout(
      () => process.exit(1),
      config.SHUTDOWN_TIMEOUT_MS + 500,
    )
    deadline.unref()
    stop('fatal')
  }
  process.on('uncaughtException', crash)
  process.on('unhandledRejection', crash)
  server.on('error', crash)
  server.listen(config.PORT, config.HOST, () =>
    logger.info({
      event: 'server.started',
      port: config.PORT,
      version: config.BUILD_SHA,
    }),
  )
}
