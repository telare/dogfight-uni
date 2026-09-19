/**
 * Dogfight — Модель лобі на базі EventTarget та Fetch/AbortController (Lab 03)
 *
 * Вимоги специфікації:
 * 1. class Lobby extends EventTarget
 * 2. Запити через fetchJson із таймаутом на кожен запит через AbortSignal.timeout
 * 3. Періодичний refresh на інтервалі під час перебування в лобі
 * 4. Миттєве скасування незавершених запитів через AbortController при виході з лобі або вході в гру
 * 5. Повне відокремлення моделі від DOM-рендерингу (render у окремому модулі lobbyView.js)
 */

import { fetchJson } from '../assets/loader.js'

export class Lobby extends EventTarget {
  /** @type {Array<Object>} */
  rooms = []

  /** @type {string|null} */
  selectedRoomId = null

  playerName = 'Ace-Pilot'
  status = 'idle' // 'idle' | 'fetching' | 'joined' | 'error'
  lastError = null

  #apiUrl = '/api/rooms'
  #pollTimer = null
  #currentController = null

  constructor({ apiUrl = '/api/rooms', playerName = 'Ace-Pilot' } = {}) {
    super()
    this.#apiUrl = apiUrl
    this.playerName = playerName
  }

  /**
   * Допоміжний метод відправки CustomEvent
   * @param {string} type
   * @param {any} [detail]
   */
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  setPlayerName(name) {
    this.playerName = (name || '').trim() || 'Pilot'
    this.emit('nameChanged', { playerName: this.playerName })
  }

  selectRoom(roomId) {
    this.selectedRoomId = roomId
    this.emit('roomSelected', { roomId })
  }

  setApiUrl(url) {
    this.#apiUrl = url
  }

  /**
   * Отримання списку відкритих ігрових кімнат по HTTP.
   * Кожен запит захищено AbortSignal.timeout та ручним AbortController.
   *
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=3000]
   * @returns {Promise<Array<Object>>}
   */
  async refresh({ timeoutMs = 3000 } = {}) {
    // Скасовуємо попередній запит, якщо він ще виконується (уникнення race condition)
    if (this.#currentController) {
      this.#currentController.abort()
      this.#currentController = null
    }

    const controller = new AbortController()
    this.#currentController = controller

    // Комбінований сигнал: ручний або таймаут
    let signal = controller.signal
    if (typeof AbortSignal.timeout === 'function') {
      const timeoutSig = AbortSignal.timeout(timeoutMs)
      if (typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any([controller.signal, timeoutSig])
      } else {
        timeoutSig.addEventListener('abort', () => controller.abort(), {
          once: true,
        })
      }
    }

    this.status = 'fetching'
    this.emit('statusChanged', { status: this.status })

    try {
      let data = null
      try {
        data = await fetchJson(this.#apiUrl, { signal })
      } catch (err) {
        if (this.#apiUrl === '/api/rooms' && err.name !== 'AbortError') {
          data = await fetchJson('/api/rooms.json', { signal })
        } else {
          throw err
        }
      }

      this.rooms = Array.isArray(data) ? data : []
      this.status = 'idle'
      this.lastError = null

      // Якщо поточна кімната не обрана або відсутня в списку, обираємо першу
      if (
        (!this.selectedRoomId ||
          !this.rooms.some((r) => r.id === this.selectedRoomId)) &&
        this.rooms.length > 0
      ) {
        this.selectedRoomId = this.rooms[0].id
      }

      this.emit('roomsUpdated', {
        rooms: this.rooms,
        selectedRoomId: this.selectedRoomId,
      })
      this.emit('statusChanged', { status: this.status })

      return this.rooms
    } catch (err) {
      // Якщо запит було скасовано свідомо при переході або зміні кімнати
      if (err.name === 'AbortError') {
        this.emit('aborted', { reason: 'Запит скасовано або таймаут' })
        return this.rooms
      }

      this.status = 'error'
      this.lastError = err
      this.emit('error', { error: err })
      this.emit('statusChanged', { status: this.status })
      throw err
    } finally {
      if (this.#currentController === controller) {
        this.#currentController = null
      }
    }
  }

  /**
   * Запуск періодичного оновлення списку кімнат.
   * Виконується лише поки користувач знаходиться на екрані лобі.
   *
   * @param {number} [intervalMs=4000]
   */
  startPolling(intervalMs = 4000) {
    this.stopPolling()
    this.refresh().catch(() => {
      // помилка обробляється через подію 'error'
    })

    this.#pollTimer = setInterval(() => {
      this.refresh().catch(() => {})
    }, intervalMs)
  }

  /**
   * Зупинка опитування та НЕГАЙНЕ скасування будь-яких завислих HTTP-запитів.
   * Викликається у ту ж мить, коли гравець залишає лобі.
   */
  stopPolling() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer)
      this.#pollTimer = null
    }

    if (this.#currentController) {
      this.#currentController.abort()
      this.#currentController = null
    }
  }

  /**
   * Підключення до обраної кімнати та старт локальної сесії.
   *
   * @param {string} [roomId]
   * @returns {Object} конфігурація обраної кімнати
   */
  join(roomId = this.selectedRoomId) {
    // 1. Негайно перериваємо всі запити лобі
    this.stopPolling()

    const room = this.rooms.find((r) => r.id === roomId) || {
      id: roomId || 'local-room',
      name: 'Custom Flight Sector',
      difficulty: 'Normal',
      arena: 'standard',
    }

    this.status = 'joined'
    this.selectedRoomId = room.id

    this.emit('statusChanged', { status: this.status })
    this.emit('joined', {
      room,
      playerName: this.playerName,
    })

    return room
  }

  /**
   * Повернення в лобі з гри
   */
  leave() {
    this.status = 'idle'
    this.emit('statusChanged', { status: this.status })
    this.emit('left', {})
    this.startPolling()
  }
}
