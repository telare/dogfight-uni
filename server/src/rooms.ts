import { sendMeasured } from './metrics.ts'
import type { WebSocket } from 'ws'
import { type ServerMessage, type EntityId } from 'shared'
export interface Player {
  id: string
  name: string
  socket: WebSocket
  joinedAt?: number
  shipId?: EntityId
}
export interface RoomOptions {
  id: string
  name: string
  difficulty?: string
  arena?: string
  maxPlayers?: number
  persistent?: boolean
}
interface RoomEvents {
  join: [Player]
  leave: [Player]
  chat: [Extract<ServerMessage, { type: 'chat' }>]
  empty: [Room]
  error: [Error]
}
/**
 * Dogfight Server — Менеджер ігрових кімнат на базі EventEmitter (Lab 04 M2)
 * Кожна кімната Room успадковує EventEmitter та веде запис подій у MatchLog.
 */

import { EventEmitter } from 'node:events'
import { ServerMessageType } from './protocol.ts'
import { MatchLog } from './log/matchlog.ts'
import { Match } from './match.ts'
import { config } from './config.ts'
import { logger } from './logger.ts'

export class Room extends EventEmitter<RoomEvents> {
  id: string
  name: string
  players: Map<string, Player>

  difficulty: string
  arena: string
  maxPlayers: number
  persistent: boolean
  createdAt: number
  matchLog: MatchLog
  match: Match

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
  }: RoomOptions) {
    super()
    this.id = id
    this.name = name
    this.difficulty = difficulty
    this.arena = arena
    this.maxPlayers = Math.min(maxPlayers, config.MAX_PLAYERS_PER_ROOM)
    this.persistent = persistent
    this.createdAt = Date.now()

    /** @type {Map<string, { id: string, name: string, socket: import('ws').WebSocket, joinedAt: number, shipId?: number }>} */
    this.players = new Map()
    this.matchLog = new MatchLog(this.id)

    // Авторитетний матч симуляції на 30 Hz (Lab 05)
    this.match = new Match({
      room: this,
      tickRate: 30,
    })
    this.match.start()

    // Запобігаємо падінню процесу при необроблених error-подіях EventEmitter
    this.on('error', (err) => {
      logger.error({ event: 'rooms.operation', err: err })
    })
  }

  get playerCount() {
    return this.players.size
  }

  get isFull() {
    return (
      this.players.size >= this.maxPlayers ||
      this.players.size + this.match.bots.size >= config.MAX_PLAYERS_PER_ROOM
    )
  }

  /**
   * Список активних гравців для розсилки ростера
   * @returns {Array<{ id: string, name: string }>}
   */
  getRoster() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      shipId: p.shipId,
    }))
  }

  /**
   * Підключення гравця до кімнати
   * @param {{ id: string, name: string, socket: import('ws').WebSocket }} player
   */
  join(player: Player) {
    if (this.players.has(player.id)) throw new Error('Already joined')
    if (this.isFull) {
      throw new Error(`Кімната ${this.name} заповнена`)
    }

    // Створюємо корабель у матчі
    const ship = this.match.addPlayer(player)
    player.shipId = ship.id

    this.players.set(player.id, {
      id: player.id,
      name: player.name,
      socket: player.socket,
      shipId: ship.id,
      joinedAt: Date.now(),
    })

    // Логуємо подію у стрім матчу
    this.matchLog.record({
      type: 'player:join',
      playerId: player.id,
      name: player.name,
      shipId: ship.id,
    })

    this.emit('join', player)

    // 1. Надсилаємо вітальне повідомлення з повним ростером щойно підключеному
    this.sendTo(player.socket, {
      type: ServerMessageType.WELCOME,
      playerId: player.id,
      shipId: ship.id,
      tickRate: this.match.tickRate,
      seed: this.match.seed,
      arena: {
        width: this.match.arenaWidth,
        height: this.match.arenaHeight,
      },
      config: this.match.latencyInjector.getConfig(),
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
        player: { id: player.id, name: player.name, shipId: ship.id },
        roster: this.getRoster(),
      },
      player.id,
    )
  }

  /**
   * Відключення гравця від кімнати
   * @param {string} playerId
   */
  leave(playerId: string) {
    const player = this.players.get(playerId)
    if (!player) return

    this.players.delete(playerId)
    this.match.removePlayer(playerId)

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
  chat(playerId: string, text: string) {
    const player = this.players.get(playerId)
    if (!player) return

    const chatMsg: Extract<ServerMessage, { type: 'chat' }> = {
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
  broadcast(msg: ServerMessage, excludeId: string | null = null) {
    const payload = JSON.stringify(msg)
    for (const [id, player] of this.players) {
      if (id === excludeId) continue
      this.sendRaw(player.socket, payload)
    }
  }

  sendTo(socket: WebSocket, msg: ServerMessage) {
    this.sendRaw(socket, JSON.stringify(msg))
  }

  sendRaw(socket: WebSocket, payload: string) {
    if (socket && socket.readyState === 1) {
      // readyState 1 === OPEN
      sendMeasured(socket, payload)
    }
  }

  /**
   * Закриття кімнати та збереження логу
   */
  async destroy() {
    this.match.stop()
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
      stats: this.match.getStats(),
    }
  }
}

/**
 * Керуючий менеджер списку кімнат на сервері
 */
export class RoomManager {
  /** @type {Map<string, Room>} */
  #rooms = new Map<string, Room>()

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

  createRoom(options: Omit<RoomOptions, 'id'> & { id?: string }) {
    const id =
      options.id || `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    if (this.#rooms.has(id)) throw new Error('Room already exists')
    if (this.count >= config.MAX_ROOMS) throw new Error('Room limit reached')
    const room = new Room({ ...options, id })
    logger.info({ event: 'room.created', roomId: id })

    this.#rooms.set(id, room)

    // При спорожненні неперсистентної кімнати видаляємо її
    room.on('empty', () => {
      if (!room.persistent) {
        this.deleteRoom(room.id)
      }
    })

    return room
  }

  getRoom(id: string) {
    return this.#rooms.get(id)
  }

  hasRoom(id: string) {
    return this.#rooms.has(id)
  }

  deleteRoom(id: string) {
    const room = this.#rooms.get(id)
    if (room) {
      room
        .destroy()
        .catch((error: unknown) =>
          logger.error({ event: 'rooms.operation', err: error }),
        )
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
