/**
 * Dogfight Server — Менеджер ігрових кімнат на базі EventEmitter (Lab 04 M2)
 * Кожна кімната Room успадковує EventEmitter та веде запис подій у MatchLog.
 */

import { EventEmitter } from 'node:events'
import { ServerMessageType } from './protocol.js'
import { MatchLog } from './log/matchlog.js'

export class Room extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} options.name
   * @param {string} [options.difficulty='Normal']
   * @param {string} [options.arena='standard']
   * @param {number} [options.maxPlayers=8]
   * @param {boolean} [options.persistent=false]
   */
  constructor({
    id,
    name,
    difficulty = 'Normal',
    arena = 'standard',
    maxPlayers = 8,
    persistent = false,
  }) {
    super()
    this.id = id
    this.name = name
    this.difficulty = difficulty
    this.arena = arena
    this.maxPlayers = maxPlayers
    this.persistent = persistent
    this.createdAt = Date.now()

    /** @type {Map<string, { id: string, name: string, socket: import('ws').WebSocket, joinedAt: number }>} */
    this.players = new Map()
    this.matchLog = new MatchLog(this.id)

    // Запобігаємо падінню процесу при необроблених error-подіях EventEmitter
    this.on('error', (err) => {
      console.error(`[Room ${this.id}] Помилка EventEmitter:`, err)
    })
  }

  get playerCount() {
    return this.players.size
  }

  get isFull() {
    return this.players.size >= this.maxPlayers
  }

  /**
   * Список активних гравців для розсилки ростера
   * @returns {Array<{ id: string, name: string }>}
   */
  getRoster() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }))
  }

  /**
   * Підключення гравця до кімнати
   * @param {{ id: string, name: string, socket: import('ws').WebSocket }} player
   */
  join(player) {
    if (this.isFull) {
      throw new Error(`Кімната ${this.name} заповнена`)
    }

    this.players.set(player.id, {
      id: player.id,
      name: player.name,
      socket: player.socket,
      joinedAt: Date.now(),
    })

    // Логуємо подію у стрім матчу
    this.matchLog.record({
      type: 'player:join',
      playerId: player.id,
      name: player.name,
    })

    this.emit('join', player)

    // 1. Надсилаємо вітальне повідомлення з повним ростером щойно підключеному
    this.sendTo(player.socket, {
      type: ServerMessageType.WELCOME,
      playerId: player.id,
      room: {
        id: this.id,
        name: this.name,
        difficulty: this.difficulty,
        arena: this.arena,
      },
      roster: this.getRoster(),
    })

    // 2. Оповіщаємо інших гравців про нового пілота та оновлюємо ростер
    this.broadcast(
      {
        type: ServerMessageType.JOINED,
        player: { id: player.id, name: player.name },
        roster: this.getRoster(),
      },
      player.id,
    )
  }

  /**
   * Відключення гравця від кімнати
   * @param {string} playerId
   */
  leave(playerId) {
    const player = this.players.get(playerId)
    if (!player) return

    this.players.delete(playerId)

    this.matchLog.record({
      type: 'player:leave',
      playerId,
      name: player.name,
    })

    this.emit('leave', player)

    // Оповіщаємо інших гравців про вихід
    this.broadcast({
      type: ServerMessageType.LEFT,
      playerId,
      name: player.name,
      roster: this.getRoster(),
    })

    // Якщо кімната спорожніла і не є персистентною — сигналізуємо менеджеру
    if (this.players.size === 0) {
      this.emit('empty', this)
    }
  }

  /**
   * Відправка повідомлення в загальний чат кімнати
   * @param {string} playerId
   * @param {string} text
   */
  chat(playerId, text) {
    const player = this.players.get(playerId)
    if (!player) return

    const chatMsg = {
      type: ServerMessageType.CHAT,
      from: player.name,
      playerId,
      text,
      t: Date.now(),
    }

    this.matchLog.record({
      type: 'chat:message',
      from: player.name,
      playerId,
      text,
    })

    this.broadcast(chatMsg)
    this.emit('chat', chatMsg)
  }

  /**
   * Розсилка повідомлення всім сокетам у кімнаті
   * @param {Object} msg
   * @param {string} [excludeId=null]
   */
  broadcast(msg, excludeId = null) {
    const payload = JSON.stringify(msg)
    for (const [id, player] of this.players) {
      if (id === excludeId) continue
      this.sendRaw(player.socket, payload)
    }
  }

  sendTo(socket, msg) {
    this.sendRaw(socket, JSON.stringify(msg))
  }

  sendRaw(socket, payload) {
    if (socket && socket.readyState === 1) {
      // readyState 1 === OPEN
      socket.send(payload)
    }
  }

  /**
   * Закриття кімнати та збереження логу
   */
  async destroy() {
    this.broadcast({
      type: ServerMessageType.ERROR,
      message: 'Кімнату закрито сервером',
    })
    for (const player of this.players.values()) {
      if (player.socket) player.socket.close(1001, 'Room destroyed')
    }
    this.players.clear()
    await this.matchLog.close()
    this.removeAllListeners()
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      difficulty: this.difficulty,
      arena: this.arena,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
    }
  }
}

/**
 * Керуючий менеджер списку кімнат на сервері
 */
export class RoomManager {
  /** @type {Map<string, Room>} */
  #rooms = new Map()

  constructor() {
    this.#seedDefaultRooms()
  }

  get count() {
    return this.#rooms.size
  }

  #seedDefaultRooms() {
    const defaults = [
      {
        id: 'room-alpha',
        name: 'Alpha Outpost (Casual)',
        difficulty: 'Normal',
        arena: 'standard',
        maxPlayers: 8,
        persistent: true,
      },
      {
        id: 'room-nebula',
        name: 'Nebula Sector (High Velocity)',
        difficulty: 'Hard',
        arena: 'storm',
        maxPlayers: 8,
        persistent: true,
      },
      {
        id: 'room-void',
        name: 'Deep Void (Hunter Asteroids)',
        difficulty: 'Extreme',
        arena: 'dense',
        maxPlayers: 4,
        persistent: true,
      },
    ]

    for (const opt of defaults) {
      this.createRoom(opt)
    }
  }

  createRoom(options) {
    const id =
      options.id || `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const room = new Room({ ...options, id })

    this.#rooms.set(id, room)

    // При спорожненні неперсистентної кімнати видаляємо її
    room.on('empty', () => {
      if (!room.persistent) {
        this.deleteRoom(room.id)
      }
    })

    return room
  }

  getRoom(id) {
    return this.#rooms.get(id)
  }

  hasRoom(id) {
    return this.#rooms.has(id)
  }

  deleteRoom(id) {
    const room = this.#rooms.get(id)
    if (room) {
      room.destroy()
      this.#rooms.delete(id)
      return true
    }
    return false
  }

  listRooms() {
    return Array.from(this.#rooms.values()).map((r) => r.toJSON())
  }

  async closeAll() {
    for (const room of this.#rooms.values()) {
      await room.destroy()
    }
    this.#rooms.clear()
  }
}
