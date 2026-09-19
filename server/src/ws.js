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
} from './protocol.js'

/**
 * Простий алгоритм Token Bucket для обмеження швидкості повідомлень
 */
class TokenBucket {
  constructor(rate = 15, capacity = 20) {
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
 * @param {import('./rooms.js').RoomManager} context.roomManager
 * @param {typeof import('./config.js').config} context.config
 * @returns {WebSocketServer}
 */
export function attachWebSocketServer(httpServer, { roomManager, config }) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.MAX_PAYLOAD_BYTES,
  })

  // Періодичний пінг клієнтів (Heartbeat)
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
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

  wss.on('connection', (socket) => {
    socket.isAlive = true
    socket.playerId = `pilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    socket.currentRoom = null
    socket.rateLimiter = new TokenBucket(config.RATE_LIMIT_PER_SEC, 25)

    // КРИТИЧНЕ ПРАВИЛО NODE.JS: кожен сокет зобов'язаний мати обробник помилки 'error'
    socket.on('error', (err) => {
      console.error(`[WS Socket Error] ${socket.playerId}:`, err.message)
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

    // 2. Обробник вхідних повідомлень
    socket.on('message', (rawData) => {
      // Перевірка Backpressure для повільних клієнтів (Slow-Client Policy)
      if (socket.bufferedAmount > config.BUFFERED_AMOUNT_THRESHOLD) {
        console.warn(
          `[WS Slow-Client] Буфер сокета ${socket.playerId} (${socket.bufferedAmount} bytes) перевищив поріг.`,
        )
      }

      // Перевірка Rate Limit (Token Bucket)
      if (!socket.rateLimiter.consume()) {
        console.warn(
          `[WS Rate Limit] Клієнт ${socket.playerId} перевищив ліміт запитів.`,
        )
        socket.send(
          JSON.stringify({
            type: ServerMessageType.ERROR,
            message: 'Rate limit exceeded. Slow down.',
          }),
        )
        return
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
          validation.reason,
        )
        return
      }

      const msg = validation.msg

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
              message: err.message,
            }),
          )
          socket.close(CloseCode.POLICY_VIOLATION, err.message)
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
        socket.send(JSON.stringify({ type: ServerMessageType.PONG }))
      }
    })

    // 3. Обробник закриття сокета
    socket.on('close', (code, reason) => {
      clearTimeout(joinTimer)
      if (socket.currentRoom) {
        console.log(
          `[WS] ${socket.playerId} відключився від ${socket.currentRoom.id} (код: ${code}, причина: ${reason || 'none'})`,
        )
        socket.currentRoom.leave(socket.playerId)
        socket.currentRoom = null
      }
    })
  })

  return wss
}
