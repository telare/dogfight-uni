/**
 * Dogfight Client — Модуль мережевого з'єднання через WebSocket (Lab 04 M2)
 *
 * Особливості реалізації:
 * 1. Черга надсилання повідомлень (Send Queue) під час встановлення з'єднання.
 * 2. Автоматичне перепідключення з експоненційним бекоффом та джиттером (Reconnect with Backoff).
 * 3. Диспетчеризація повідомлень за типом через CustomEvents на базі EventTarget.
 */

export class GameConnection extends EventTarget {
  /** @type {WebSocket|null} */
  #ws = null

  /** @type {'disconnected'|'connecting'|'connected'} */
  status = 'disconnected'

  #sendQueue = []
  #reconnectAttempts = 0
  #maxReconnectAttempts = 5
  #isIntentionalClose = false
  #reconnectTimer = null

  constructor() {
    super()
    this.currentRoom = null
    this.playerName = 'Pilot'
    this.playerId = null
    this.roster = []
  }

  /**
   * Отримання WebSocket URL з урахуванням поточного хоста та протоколу
   */
  get wsUrl() {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws'
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // У dev-режимі Vite проксіює /ws на бекенд (порт 3000)
    return `${protocol}//${window.location.host}/ws`
  }

  /**
   * Підключення до ігрової кімнати
   * @param {string} roomId
   * @param {string} playerName
   */
  connect(roomId, playerName = 'Pilot') {
    this.disconnect()

    this.currentRoom = roomId
    this.playerName = playerName
    this.#isIntentionalClose = false
    this.status = 'connecting'

    this.emit('status', { status: this.status })

    try {
      const socket = new WebSocket(this.wsUrl)
      this.#ws = socket

      socket.onopen = () => {
        console.log(`[WS] З'єднання встановлено з ${this.wsUrl}`)
        this.status = 'connected'
        this.#reconnectAttempts = 0

        // Надсилаємо обов'язкове перше повідомлення join (до вичерпання 5с таймауту)
        this.sendImmediately({
          type: 'join',
          room: this.currentRoom,
          name: this.playerName,
        })

        // Скидаємо буферизовані повідомлення із черги
        while (this.#sendQueue.length > 0) {
          const queued = this.#sendQueue.shift()
          this.sendImmediately(queued)
        }

        this.emit('status', { status: this.status })
      }

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          this.#handleServerMessage(msg)
        } catch (err) {
          console.warn(
            '[WS] Не вдалося розпарсити повідомлення від сервера:',
            err,
          )
        }
      }

      socket.onerror = (err) => {
        console.error('[WS Error]', err)
        this.emit('error', { error: err })
      }

      socket.onclose = (event) => {
        console.log(`[WS Closed] Код: ${event.code}, причина: ${event.reason}`)
        this.status = 'disconnected'
        this.emit('status', { status: this.status })

        if (!this.#isIntentionalClose) {
          this.#scheduleReconnect()
        }
      }
    } catch (err) {
      console.error('[WS Connection Error]', err)
      this.status = 'disconnected'
      this.emit('error', { error: err })
      this.#scheduleReconnect()
    }
  }

  #handleServerMessage(msg) {
    // Диспетчеризуємо CustomEvent з іменем типу повідомлення
    this.emit(msg.type, msg)

    if (msg.type === 'welcome') {
      this.playerId = msg.playerId
      this.roster = msg.roster || []
      console.log(
        `[WS] Ласкаво просимо в ${msg.room.name}! Ваш ID: ${this.playerId}`,
      )
    } else if (msg.type === 'roster') {
      this.roster = msg.players || []
    } else if (msg.type === 'joined') {
      if (msg.roster) this.roster = msg.roster
    } else if (msg.type === 'left') {
      if (msg.roster) this.roster = msg.roster
    }
  }

  /**
   * Запланувати перепідключення з експоненційним бекоффом
   */
  #scheduleReconnect() {
    if (this.#reconnectAttempts >= this.#maxReconnectAttempts) {
      console.warn(
        '[WS] Досягнуто максимальну кількість спроб перепідключення.',
      )
      this.emit('reconnectFailed', {})
      return
    }

    this.#reconnectAttempts++
    const baseDelay = 500
    const delay =
      Math.min(5000, baseDelay * Math.pow(2, this.#reconnectAttempts - 1)) +
      Math.random() * 250

    console.log(
      `[WS] Спроба перепідключення #${this.#reconnectAttempts} через ${Math.round(delay)} мс...`,
    )

    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = setTimeout(() => {
      if (this.currentRoom && !this.#isIntentionalClose) {
        this.connect(this.currentRoom, this.playerName)
      }
    }, delay)
  }

  /**
   * Безпечне надсилання повідомлення: якщо сокет ще з'єднується — ставить у чергу Send Queue
   * @param {Object} msg
   */
  send(msg) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.sendImmediately(msg)
    } else {
      console.log('[WS Queue] Повідомлення додано у Send Queue:', msg.type)
      this.#sendQueue.push(msg)
    }
  }

  sendImmediately(msg) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg))
    }
  }

  /**
   * Відправка повідомлення в чат
   * @param {string} text
   */
  sendChat(text) {
    const trimmed = (text || '').trim()
    if (trimmed) {
      this.send({ type: 'chat', text: trimmed })
    }
  }

  /**
   * Свідоме відключення від кімнати
   */
  disconnect() {
    this.#isIntentionalClose = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
    if (this.#ws) {
      try {
        if (this.#ws.readyState === WebSocket.OPEN) {
          this.sendImmediately({ type: 'leave' })
        }
        this.#ws.close()
      } catch {
        // ігноруємо помилки при закритті
      }
      this.#ws = null
    }
    this.status = 'disconnected'
    this.roster = []
    this.#sendQueue = []
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

export const gameConnection = new GameConnection()
