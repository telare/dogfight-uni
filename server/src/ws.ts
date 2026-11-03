import type { IncomingMessage, Server } from 'node:http'
import { WebSocket } from 'ws'
import { isIP } from 'node:net'
import type { RoomManager, Room } from './rooms.ts'
import type { config as serverConfig } from './config.ts'
import { assertNever } from 'shared'
import { logger } from './logger.ts'
import { metrics, reject, sendMeasured } from './metrics.ts'
interface GameSocket extends WebSocket {
  isAlive: boolean
  playerId: string
  currentRoom: Room | null
  rateLimiter: TokenBucket
  inputRateLimiter: TokenBucket
}
/**
 * Dogfight Server — Обробник життєвого циклу WebSocket з'єднань (Lab 04 M2 & M4)
 *
 * Вимоги безпеки та архітектури:
 * 1. Таймаут 5 секунд на повідомлення join (якщо не надійшло — сокет закривається).
 * 2. Обов'язковий обробник "error" на КОЖНОМУ сокеті (захист від краху Node.js).
 * 3. Heartbeat (ping/pong кожні 15 с) із відключенням завислих клієнтів.
 * 4. Token-bucket обмеження швидкості запитів (Rate Limiting).
 * 5. Контроль Backpressure (політика slow-client за socket.bufferedAmount).
 */

import { WebSocketServer } from 'ws'
import {
  CloseCode,
  ClientMessageType,
  ServerMessageType,
  validateClientMessage,
} from './protocol.ts'
import { decodeAnyBinary, encodePong } from 'shared'

/**
 * Простий алгоритм Token Bucket для обмеження швидкості повідомлень
 */
export class TokenBucket {
  rate: number
  capacity: number
  tokens: number
  lastRefill: number

  constructor(rate = 60, capacity = 100) {
    this.rate = rate
    this.capacity = capacity
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  consume() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }
}

/**
 * Прив'язка WebSocketServer до нативного HTTP-сервера
 * @param {import('node:http').Server} httpServer
 * @param {Object} context
 * @param {import('./rooms.ts').RoomManager} context.roomManager
 * @param {typeof import('./config.ts').config} context.config
 * @returns {WebSocketServer}
 */
export function connectionIp(
  req: IncomingMessage | undefined,
  trusted: readonly string[] = [],
): string {
  const peer = (req?.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')
  const forwarded = req?.headers['x-real-ip']
  return trusted.includes(peer) &&
    typeof forwarded === 'string' &&
    isIP(forwarded)
    ? forwarded
    : peer
}

export function attachWebSocketServer(
  httpServer: Server,
  {
    roomManager,
    config,
    isDraining = () => false,
  }: {
    roomManager: RoomManager
    config: typeof serverConfig
    isDraining?: () => boolean
  },
) {
  const connections = new Map<string, number>()
  const wss = new WebSocketServer<typeof WebSocket>({
    server: httpServer,
    path: '/ws',
    maxPayload: config.MAX_PAYLOAD_BYTES,
    verifyClient: ({
      req,
      origin,
    }: {
      req: IncomingMessage
      origin: string
    }) => {
      // Only explicitly configured peer addresses may supply the proxy-controlled X-Real-IP.
      const ip = connectionIp(req, config.TRUSTED_PROXY_IPS)
      if (isDraining()) {
        reject('draining')
        return false
      }
      if (
        !(origin
          ? config.ALLOWED_ORIGINS.includes(origin)
          : config.ALLOW_MISSING_ORIGIN || config.NODE_ENV !== 'production')
      ) {
        reject('origin')
        return false
      }
      if ((connections.get(ip) ?? 0) >= config.MAX_CONNECTIONS_PER_IP) {
        reject('ip_limit')
        return false
      }
      return true
    },
  })

  // Періодичний пінг клієнтів (Heartbeat)
  const sessions = new WeakMap<WebSocket, GameSocket>()
  const heartbeatInterval = setInterval(() => {
    for (const rawSocket of wss.clients) {
      const ws = sessions.get(rawSocket)
      if (!ws) continue
      if (ws.isAlive === false) {
        logger.debug({ event: 'ws.operation' })
        reject('heartbeat', ws.playerId)
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, config.HEARTBEAT_INTERVAL_MS)
  heartbeatInterval.unref()

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })

  wss.on('connection', (rawSocket, req) => {
    const ip = connectionIp(req, config.TRUSTED_PROXY_IPS)
    connections.set(ip, (connections.get(ip) ?? 0) + 1)
    rawSocket.once('close', () => {
      const remaining = (connections.get(ip) ?? 1) - 1
      if (remaining) connections.set(ip, remaining)
      else connections.delete(ip)
    })
    const state: Pick<
      GameSocket,
      | 'isAlive'
      | 'playerId'
      | 'currentRoom'
      | 'rateLimiter'
      | 'inputRateLimiter'
    > = {
      isAlive: true,
      playerId: '',
      currentRoom: null,
      rateLimiter: new TokenBucket(config.RATE_LIMIT_PER_SEC, 25),
      inputRateLimiter: new TokenBucket(config.INPUT_RATE_LIMIT_PER_SEC, 120),
    }
    const socket = Object.assign(rawSocket, state)
    sessions.set(rawSocket, socket)
    socket.isAlive = true
    socket.playerId = `pilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    socket.currentRoom = null

    // КРИТИЧНЕ ПРАВИЛО NODE.JS: кожен сокет зобов'язаний мати обробник помилки 'error'
    socket.on('error', (err) => {
      if ('code' in err && err.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')
        reject('payload', socket.playerId)
      logger.error({ event: 'ws.operation' })
    })

    socket.on('pong', () => {
      socket.isAlive = true
    })

    // 1. Встановлюємо таймаут на приєднання (Join timeout)
    const joinTimer = setTimeout(() => {
      if (!socket.currentRoom) {
        reject('join_timeout', socket.playerId)
        logger.warn({ event: 'ws.operation' })
        socket.close(
          CloseCode.POLICY_VIOLATION,
          'Join message timeout exceeded',
        )
      }
    }, config.JOIN_TIMEOUT_MS)
    joinTimer.unref()

    // 2. Обробник вхідних повідомлень (Binary DataView або JSON)
    socket.on('message', (rawData, isBinary) => {
      if (socket.readyState !== WebSocket.OPEN) return
      metrics.messagesIn++
      metrics.bytesIn += Array.isArray(rawData)
        ? rawData.reduce((sum, data) => sum + data.byteLength, 0)
        : rawData.byteLength
      if (isDraining()) {
        socket.close(1001, 'Server restarting')
        return
      }
      if (socket.bufferedAmount > config.BUFFERED_AMOUNT_THRESHOLD) {
        reject('slow_client', socket.playerId)
        socket.close(1008, 'Slow client')
        return
      }
      // 2.1 Перевірка та обробка бінарних повідомлень (DataView, Lab 05 M4)
      const isBin =
        isBinary ||
        (Buffer.isBuffer(rawData) &&
          rawData.length >= 2 &&
          rawData[1] === 1 &&
          (rawData[0] === 1 || rawData[0] === 3 || rawData[0] === 5))

      if (isBin) {
        try {
          const binMsg = decodeAnyBinary(
            Array.isArray(rawData) ? Buffer.concat(rawData) : rawData,
          )
          const limiter =
            binMsg.type === 'input'
              ? socket.inputRateLimiter
              : socket.rateLimiter
          if (!limiter.consume()) {
            reject('rate', socket.playerId)
            socket.close(CloseCode.POLICY_VIOLATION, 'Rate limit exceeded')
            return
          }
          if (binMsg.type === 'input') {
            if (socket.currentRoom) {
              socket.currentRoom.match.queueInput(socket.playerId, binMsg)
            }
            return
          }
          if (binMsg.type === 'ping') {
            const pongBuffer = encodePong(binMsg.clientTime, Date.now())
            if (socket.currentRoom) {
              socket.currentRoom.match.latencyInjector.deliver(() => {
                if (socket.readyState === 1) sendMeasured(socket, pongBuffer)
              })
            } else {
              sendMeasured(socket, pongBuffer)
            }
            return
          }
          if (binMsg.type === 'config') {
            if (!config.ENABLE_DIAGNOSTICS) return
            if (socket.currentRoom) {
              socket.currentRoom.match.latencyInjector.updateConfig(binMsg)
              if (binMsg.codec) socket.currentRoom.match.codec = binMsg.codec
            }
            return
          }
          socket.close(CloseCode.PROTOCOL_ERROR, 'Expected a client message')
          return
        } catch (err) {
          logger.warn({ event: 'ws.operation' })
          reject('protocol', socket.playerId)
          socket.close(CloseCode.PROTOCOL_ERROR, 'Invalid binary frame')
          return
        }
      }

      // Перевірка Backpressure для повільних клієнтів (Slow-Client Policy)
      if (socket.bufferedAmount > config.BUFFERED_AMOUNT_THRESHOLD) {
        logger.warn({ event: 'ws.operation' })
      }

      // Валідація схеми повідомлення
      const validation = validateClientMessage(
        rawData,
        config.MAX_PAYLOAD_BYTES,
      )
      if (!validation.valid) {
        reject('protocol', socket.playerId)
        logger.warn({ event: 'ws.operation' })
        socket.close(
          validation.code || CloseCode.PROTOCOL_ERROR,
          'Invalid client message',
        )
        return
      }

      const msg = validation.msg
      const limiter =
        msg.type === 'input' ? socket.inputRateLimiter : socket.rateLimiter
      if (!limiter.consume()) {
        reject('rate', socket.playerId)
        socket.close(CloseCode.POLICY_VIOLATION, 'Rate limit exceeded')
        return
      }

      // Обробка типів повідомлень
      if (msg.type === ClientMessageType.JOIN) {
        clearTimeout(joinTimer)

        if (socket.currentRoom) {
          socket.close(1008, 'Already joined')
          return
        }
        try {
          let targetRoom = roomManager.getRoom(msg.room)
          if (!targetRoom) {
            // Якщо кімнати немає в списку — створюємо динамічну
            targetRoom = roomManager.createRoom({
              id: msg.room,
              name: `Sector ${msg.room}`,
              persistent: false,
            })
          }

          targetRoom.join({
            id: socket.playerId,
            name: msg.name,
            socket,
          })
          socket.currentRoom = targetRoom
          logger.info({
            event: 'player.joined',
            playerId: socket.playerId,
            roomId: targetRoom.id,
          })
          logger.debug({ event: 'ws.operation' })
        } catch (err) {
          reject('capacity', socket.playerId)
          sendMeasured(
            socket,
            JSON.stringify({
              type: ServerMessageType.ERROR,
              message: err instanceof Error ? err.message : String(err),
            }),
          )
          socket.close(CloseCode.POLICY_VIOLATION, 'Room unavailable')
        }
      } else if (msg.type === ClientMessageType.INPUT) {
        if (socket.currentRoom) {
          socket.currentRoom.match.queueInput(socket.playerId, msg)
        }
      } else if (msg.type === ClientMessageType.CONFIG) {
        if (!config.ENABLE_DIAGNOSTICS) return
        if (socket.currentRoom) {
          socket.currentRoom.match.latencyInjector.updateConfig(msg)
          if (msg.codec) socket.currentRoom.match.codec = msg.codec
        }
      } else if (msg.type === ClientMessageType.CHAT) {
        if (!socket.currentRoom) {
          sendMeasured(
            socket,
            JSON.stringify({
              type: ServerMessageType.ERROR,
              message: 'Cannot chat: Not joined to any room',
            }),
          )
          return
        }
        socket.currentRoom.chat(socket.playerId, msg.text)
      } else if (msg.type === ClientMessageType.LEAVE) {
        if (socket.currentRoom) {
          socket.currentRoom.leave(socket.playerId)
          socket.currentRoom = null
        }
        socket.close(CloseCode.NORMAL, 'Player left')
      } else if (msg.type === ClientMessageType.PING) {
        const clientTime = msg.clientTime || Date.now()
        const pong = JSON.stringify({
          type: ServerMessageType.PONG,
          clientTime,
          serverTime: Date.now(),
        })
        if (socket.currentRoom) {
          socket.currentRoom.match.latencyInjector.deliver(() => {
            if (socket.readyState === 1) sendMeasured(socket, pong)
          })
        } else {
          sendMeasured(socket, pong)
        }
      } else {
        assertNever(msg)
      }
    })

    // 3. Обробник закриття сокета
    socket.on('close', (code, reason) => {
      clearTimeout(joinTimer)
      logger.info({
        event: 'player.left',
        playerId: socket.playerId,
        roomId: socket.currentRoom?.id,
        code,
      })
      if (socket.currentRoom) {
        logger.debug({ event: 'ws.operation' })
        socket.currentRoom.leave(socket.playerId)
        socket.currentRoom = null
      }
    })
  })

  return wss
}
