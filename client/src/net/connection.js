/**
 * Dogfight Client — Модуль мережевого з'єднання через WebSocket (Lab 04 M2 & Lab 05 M1-M4)
 *
 * Особливості Lab 05:
 * 1. Підтримка бінарного DataView протоколу (ArrayBuffer) та перемикання на JSON.
 * 2. Високоточний розрахунок RTT (Round-Trip Time) через ping/pong.
 * 3. Вимірювання вхідного/вихідного трафіку (KB/s In/Out, snapshot bytes).
 * 4. Відправка вхідних команд (Input frames) на авторитетний сервер.
 * 5. Динамічна конфігурація Latency Injector (затримка, джиттер, дроп).
 */

import { decodeAnyBinary, encodeInput, encodePing, encodeConfig } from 'shared'

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
  #pingTimer = null
  #bandwidthTimer = null

  // Трафік та телеметрія
  #bytesInPeriod = 0
  #bytesOutPeriod = 0
  #bytesInTotal = 0
  #bytesOutTotal = 0
  #snapshotCounterPeriod = 0

  constructor() {
    super()
    this.currentRoom = null
    this.playerName = 'Pilot'
    this.playerId = null
    this.shipId = null
    this.roster = []

    // Кодек: 'binary' | 'json'
    this.codec = 'binary'

    // Мережеві метрики для Netgraph
    this.rtt = 0
    this.rttHistory = []
    this.kbpsIn = 0
    this.kbpsOut = 0
    this.lastSnapshotBytes = 0
    this.lastSnapshotTime = 0
    this.snapshotCount = 0
    this.snapshotsPerSec = 0
    this.#snapshotCounterPeriod = 0

    // Параметри затримки
    this.latencyMs = 0
    this.jitterMs = 0
  }

  get totalBytesIn() {
    return this.#bytesInTotal
  }

  get totalBytesOut() {
    return this.#bytesOutTotal
  }

  get wsUrl() {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws'
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }

  connect(roomId, playerName = 'Pilot') {
    this.disconnect()

    this.currentRoom = roomId
    this.playerName = playerName
    this.#isIntentionalClose = false
    this.status = 'connecting'

    this.emit('status', { status: this.status })

    try {
      const socket = new WebSocket(this.wsUrl)
      socket.binaryType = 'arraybuffer'
      this.#ws = socket

      socket.onopen = () => {
        console.log(
          `[WS] З'єднання встановлено з ${this.wsUrl} (binaryType: arraybuffer)`,
        )
        this.status = 'connected'
        this.#reconnectAttempts = 0

        this.#startPingAndBandwidthTimers()

        // Перше обов'язкове повідомлення join
        this.sendImmediately({
          type: 'join',
          room: this.currentRoom,
          name: this.playerName,
        })

        // Скидання черги
        while (this.#sendQueue.length > 0) {
          const queued = this.#sendQueue.shift()
          this.sendImmediately(queued)
        }

        this.emit('status', { status: this.status })
      }

      socket.onmessage = (event) => {
        let msg = null
        let byteLen = 0

        if (event.data instanceof ArrayBuffer) {
          byteLen = event.data.byteLength
          this.#bytesInPeriod += byteLen
          this.#bytesInTotal += byteLen
          try {
            msg = decodeAnyBinary(event.data)
          } catch (err) {
            console.warn('[WS Binary Decode Error]:', err)
            return
          }
        } else if (typeof event.data === 'string') {
          byteLen = event.data.length
          this.#bytesInPeriod += byteLen
          this.#bytesInTotal += byteLen
          try {
            msg = JSON.parse(event.data)
          } catch (err) {
            console.warn('[WS JSON Parse Error]:', err)
            return
          }
        }

        if (msg) {
          this.#handleServerMessage(msg, byteLen)
        }
      }

      socket.onerror = (err) => {
        console.error('[WS Error]', err)
        this.emit('error', { error: err })
      }

      socket.onclose = (event) => {
        console.log(`[WS Closed] Код: ${event.code}, причина: ${event.reason}`)
        this.status = 'disconnected'
        this.#stopTimers()
        this.emit('status', { status: this.status })

        if (!this.#isIntentionalClose) {
          this.#scheduleReconnect()
        }
      }
    } catch (err) {
      console.error('[WS Connection Error]', err)
      this.status = 'disconnected'
      this.#stopTimers()
      this.emit('error', { error: err })
      this.#scheduleReconnect()
    }
  }

  #startPingAndBandwidthTimers() {
    this.#stopTimers()

    // 1. Періодичний Ping кожні 600 мс для точного RTT
    this.#pingTimer = setInterval(() => {
      this.sendPing()
    }, 600)

    // 2. Розрахунок KB/s In/Out та частоти знімків кожні 1000 мс
    this.#bandwidthTimer = setInterval(() => {
      this.kbpsIn = Number(((this.#bytesInPeriod * 8) / 1024 / 1).toFixed(1))
      this.kbpsOut = Number(((this.#bytesOutPeriod * 8) / 1024 / 1).toFixed(1))
      this.snapshotsPerSec = this.#snapshotCounterPeriod
      this.#bytesInPeriod = 0
      this.#bytesOutPeriod = 0
      this.#snapshotCounterPeriod = 0
    }, 1000)
  }

  #stopTimers() {
    if (this.#pingTimer) {
      clearInterval(this.#pingTimer)
      this.#pingTimer = null
    }
    if (this.#bandwidthTimer) {
      clearInterval(this.#bandwidthTimer)
      this.#bandwidthTimer = null
    }
  }

  sendPing() {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return
    const now = performance.now()

    if (this.codec === 'binary') {
      const pingBuf = encodePing(now)
      this.#bytesOutPeriod += pingBuf.byteLength
      this.#bytesOutTotal += pingBuf.byteLength
      this.#ws.send(pingBuf)
    } else {
      const payload = JSON.stringify({ type: 'ping', clientTime: now })
      this.#bytesOutPeriod += payload.length
      this.#bytesOutTotal += payload.length
      this.#ws.send(payload)
    }
  }

  /**
   * Відправка кадру введення на авторитетний сервер (Input Frame)
   * @param {{ seq: number, tick: number, thrust: number, turn: number, fire: boolean }} input
   */
  sendInput(input) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return

    if (this.codec === 'binary') {
      const buf = encodeInput(input)
      this.#bytesOutPeriod += buf.byteLength
      this.#bytesOutTotal += buf.byteLength
      this.#ws.send(buf)
    } else {
      const payload = JSON.stringify({
        type: 'input',
        ...input,
      })
      this.#bytesOutPeriod += payload.length
      this.#bytesOutTotal += payload.length
      this.#ws.send(payload)
    }
  }

  /**
   * Оновлення мережевих налаштувань (Latency, Jitter, Packet Drop, Codec)
   */
  updateConfig({ latencyMs, jitterMs, dropRate, codec }) {
    if (typeof latencyMs === 'number') this.latencyMs = latencyMs
    if (typeof jitterMs === 'number') this.jitterMs = jitterMs
    if (typeof dropRate === 'number') this.dropRate = dropRate
    if (codec) this.codec = codec

    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return

    const cfg = {
      latencyMs: this.latencyMs,
      jitterMs: this.jitterMs,
      dropRate: this.dropRate,
      codec: this.codec,
    }

    if (this.codec === 'binary') {
      const buf = encodeConfig(cfg)
      this.#ws.send(buf)
    } else {
      this.#ws.send(JSON.stringify({ type: 'config', ...cfg }))
    }
  }

  #handleServerMessage(msg, byteLength) {
    if (msg.type === 'snapshot') {
      this.lastSnapshotBytes = byteLength
      this.lastSnapshotTime = performance.now()
      this.snapshotCount++
      this.#snapshotCounterPeriod++
      this.emit('snapshot', msg)
      return
    }

    if (msg.type === 'pong') {
      const now = performance.now()
      if (typeof msg.clientTime === 'number') {
        const measuredRtt = Math.max(0, now - msg.clientTime)
        this.rtt = Math.round(measuredRtt)
        this.rttHistory.push(this.rtt)
        if (this.rttHistory.length > 30) this.rttHistory.shift()
      }
      this.emit('pong', msg)
      return
    }

    // Диспетчеризуємо CustomEvent
    this.emit(msg.type, msg)

    if (msg.type === 'welcome') {
      this.playerId = msg.playerId
      this.shipId = msg.shipId
      this.roster = msg.roster || []
      if (msg.config) {
        this.latencyMs = msg.config.latencyMs || 0
        this.jitterMs = msg.config.jitterMs || 0
        this.dropRate = msg.config.dropRate || 0
      }
      console.log(
        `[WS] Ласкаво просимо в ${msg.room.name}! Ваш ID: ${this.playerId}, Ship ID: ${this.shipId}`,
      )
    } else if (msg.type === 'roster') {
      this.roster = msg.players || []
    } else if (msg.type === 'joined') {
      if (msg.roster) this.roster = msg.roster
    } else if (msg.type === 'left') {
      if (msg.roster) this.roster = msg.roster
    }
  }

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

    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = setTimeout(() => {
      if (this.currentRoom && !this.#isIntentionalClose) {
        this.connect(this.currentRoom, this.playerName)
      }
    }, delay)
  }

  send(msg) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.sendImmediately(msg)
    } else {
      this.#sendQueue.push(msg)
    }
  }

  sendImmediately(msg) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      const payload = typeof msg === 'string' ? msg : JSON.stringify(msg)
      this.#bytesOutPeriod += payload.length
      this.#bytesOutTotal += payload.length
      this.#ws.send(payload)
    }
  }

  sendChat(text) {
    const trimmed = (text || '').trim()
    if (trimmed) {
      this.send({ type: 'chat', text: trimmed })
    }
  }

  disconnect() {
    this.#isIntentionalClose = true
    this.#stopTimers()
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
        // ігноруємо помилки закриття
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
