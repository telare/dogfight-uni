import type { Server } from 'node:http'
import { WebSocket } from 'ws'
import type { RoomManager, Room } from './rooms.ts'
import type { config as serverConfig } from './config.ts'
import { assertNever } from 'shared'
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
export function attachWebSocketServer(
  httpServer: Server,
  {
    roomManager,
    config,
  }: { roomManager: RoomManager; config: typeof serverConfig },
) {
  const wss = new WebSocketServer<typeof WebSocket>({
    server: httpServer,
    path: '/ws',
    maxPayload: config.MAX_PAYLOAD_BYTES,
  })

  // Періодичний пінг клієнтів (Heartbeat)
  const sessions = new WeakMap<WebSocket, GameSocket>()
  const heartbeatInterval = setInterval(() => {
    for (const rawSocket of wss.clients) {
      const ws = sessions.get(rawSocket)
      if (!ws) continue
      if (ws.isAlive === false) {
        console.log(
          `[WS] Клієнт ${ws.playerId || 'anonymous'} не відповів на pong — примусовий terminate()`,
        )
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

  wss.on('connection', (rawSocket) => {
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
      console.error(
        `[WS Socket Error] ${socket.playerId}:`,
        err instanceof Error ? err.message : String(err),
      )
    })

    socket.on('pong', () => {
      socket.isAlive = true
    })

    // 1. Встановлюємо таймаут на приєднання (Join timeout)
    const joinTimer = setTimeout(() => {
      if (!socket.currentRoom) {
        console.warn(
          `[WS] ${socket.playerId} не надіслав 'join' протягом ${config.JOIN_TIMEOUT_MS}ms. Закриття з'єднання.`,
        )
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
                if (socket.readyState === 1) socket.send(pongBuffer)
              })
            } else {
              socket.send(pongBuffer)
            }
            return
          }
          if (binMsg.type === 'config') {
            if (socket.currentRoom) {
              socket.currentRoom.match.latencyInjector.updateConfig(binMsg)
              if (binMsg.codec) socket.currentRoom.match.codec = binMsg.codec
            }
            return
          }
          socket.close(CloseCode.PROTOCOL_ERROR, 'Expected a client message')
          return
        } catch (err) {
          console.warn(
            `[WS Binary Decode Error] ${socket.playerId}:`,
            err instanceof Error ? err.message : String(err),
          )
          socket.close(CloseCode.PROTOCOL_ERROR, 'Invalid binary frame')
          return
        }
      }

      // Перевірка Backpressure для повільних клієнтів (Slow-Client Policy)
      if (socket.bufferedAmount > config.BUFFERED_AMOUNT_THRESHOLD) {
        console.warn(
          `[WS Slow-Client] Буфер сокета ${socket.playerId} (${socket.bufferedAmount} bytes) перевищив поріг.`,
        )
      }

      // Валідація схеми повідомлення
      const validation = validateClientMessage(
        rawData,
        config.MAX_PAYLOAD_BYTES,
      )
      if (!validation.valid) {
        console.warn(
          `[WS Protocol Error] Відхилено повідомлення від ${socket.playerId}: ${validation.reason}`,
        )
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
        socket.close(CloseCode.POLICY_VIOLATION, 'Rate limit exceeded')
        return
      }

      // Обробка типів повідомлень
      if (msg.type === ClientMessageType.JOIN) {
        clearTimeout(joinTimer)

        let targetRoom = roomManager.getRoom(msg.room)
        if (!targetRoom) {
          // Якщо кімнати немає в списку — створюємо динамічну
          targetRoom = roomManager.createRoom({
            id: msg.room,
            name: `Sector ${msg.room}`,
            persistent: false,
          })
        }

        try {
          targetRoom.join({
            id: socket.playerId,
            name: msg.name,
            socket,
          })
          socket.currentRoom = targetRoom
          console.log(
            `[WS] Гравець ${msg.name} (${socket.playerId}) приєднався до кімнати ${targetRoom.id}`,
          )
        } catch (err) {
          socket.send(
            JSON.stringify({
              type: ServerMessageType.ERROR,
              message: err instanceof Error ? err.message : String(err),
            }),
          )
          socket.close(
            CloseCode.POLICY_VIOLATION,
            err instanceof Error ? err.message : String(err),
          )
        }
      } else if (msg.type === ClientMessageType.INPUT) {
        if (socket.currentRoom) {
          socket.currentRoom.match.queueInput(socket.playerId, msg)
        }
      } else if (msg.type === ClientMessageType.CONFIG) {
        if (socket.currentRoom) {
          socket.currentRoom.match.latencyInjector.updateConfig(msg)
          if (msg.codec) socket.currentRoom.match.codec = msg.codec
        }
      } else if (msg.type === ClientMessageType.CHAT) {
        if (!socket.currentRoom) {
          socket.send(
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
            if (socket.readyState === 1) socket.send(pong)
          })
        } else {
          socket.send(pong)
        }
      } else {
        assertNever(msg)
      }
    })

    // 3. Обробник закриття сокета
    socket.on('close', (code, reason) => {
      clearTimeout(joinTimer)
      if (socket.currentRoom) {
        console.log(
          `[WS] ${socket.playerId} відключився від ${socket.currentRoom.id} (код: ${code}, причина: ${reason.toString() || 'none'})`,
        )
        socket.currentRoom.leave(socket.playerId)
        socket.currentRoom = null
      }
    })
  })

  return wss
}
