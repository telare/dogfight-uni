import type { Lobby } from './lobby.ts'
import type { RoomData } from 'shared'
import { query, errorMessage } from '../dom.ts'
/**
 * Dogfight — Модуль відображення лобі та чату (Lobby View) у DOM (Lab 04)
 *
 * Особливості Lab 04:
 * 1. Підтримка WebSocket зв'язку в реальному часі через gameConnection (M2).
 * 2. Живий ростер пілотів у секторі та інтерактивний радіочат (M2).
 * 3. Кнопки тестування блокування Event Loop (/api/slow, M4) та стрімінгу повторів (/api/replays, M3).
 */

function handleAsync(action: () => Promise<void>): () => void {
  return () => {
    action().catch(console.error)
  }
}

import { gameConnection } from '../net/connection.ts'

export class LobbyView {
  /** @type {import('./lobby.ts').Lobby} */
  #lobby: Lobby

  /** @type {HTMLElement|null} */
  #container!: HTMLElement

  #onJoinCallback: ((room: RoomData) => void | Promise<void>) | undefined

  constructor(
    lobby: Lobby,
    { onJoin }: { onJoin?: (room: RoomData) => void | Promise<void> } = {},
  ) {
    this.#lobby = lobby
    this.#onJoinCallback = onJoin
    this.#initDOM()
    this.#attachListeners()
    this.#attachWebSocketListeners()
  }

  #initDOM() {
    let overlay = document.querySelector<HTMLElement>('#lobby-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'lobby-overlay'
      document.body.appendChild(overlay)
    }
    this.#container = overlay
    this.#renderSkeleton()
  }

  #renderSkeleton() {
    this.#container.innerHTML = `
      <div class="lobby-card">
        <div class="lobby-header">
          <div class="lobby-title-wrap">
            <span class="lobby-badge">LAB 04 // NODE.JS, STREAMS & WEBSOCKETS</span>
            <h1 class="lobby-title">DOGFIGHT // FLIGHT OPS & RADAR</h1>
          </div>
          <div class="lobby-pilot-input-wrap">
            <label for="pilot-name">ПОЗИВНИЙ ПІЛОТА:</label>
            <input type="text" id="pilot-name" value="${this.#lobby.playerName}" maxlength="16" spellcheck="false" />
          </div>
        </div>

        <div class="lobby-body">
          <div class="lobby-rooms-section">
            <div class="section-title-row">
              <h2>ДОСТУПНІ СЕКТОРИ (HTTP GET /api/rooms)</h2>
              <div class="refresh-controls">
                <span id="lobby-status-indicator" class="status-indicator"></span>
                <button id="btn-refresh" class="btn btn-secondary">🔄 Оновити</button>
              </div>
            </div>
            <div id="rooms-list" class="rooms-grid">
              <div class="room-loading">Завантаження секторів по мережі...</div>
            </div>
          </div>

          <!-- Lab 04 Live Roster & Chat via WebSocket -->
          <div class="lobby-comms-section">
            <div class="comms-header-row">
              <h3>📡 СЕКТОРНИЙ РАДІОЗВ'ЯЗОК (WEBSOCKET /ws)</h3>
              <span id="ws-status-badge" class="ws-badge ws-disconnected">● Відключено</span>
            </div>
            <div class="comms-content-grid">
              <div class="roster-panel">
                <h4>👥 ПІЛОТИ В СЕКТОРІ:</h4>
                <ul id="roster-list" class="roster-list">
                  <li class="roster-empty">Оберіть сектор...</li>
                </ul>
              </div>
              <div class="chat-panel">
                <h4>💬 РАДІОЕФІР:</h4>
                <div id="chat-messages" class="chat-messages">
                  <div class="chat-system">Підключіться до сектора для переговорів.</div>
                </div>
                <form id="chat-form" class="chat-form">
                  <input type="text" id="chat-input" placeholder="Повідомлення в ефір..." maxlength="120" spellcheck="false" />
                  <button type="submit" class="btn btn-secondary">Надіслати</button>
                </form>
              </div>
            </div>
          </div>

          <div class="lobby-test-section">
            <h3>🧪 ДЕМО ДЛЯ ЗАХИСТУ: ЗБОЇ, EVENT LOOP ТА СТРІМИ</h3>
            <p class="test-desc">Перевірка специфікації Lab 04 (Event Loop 300ms block, Backpressure, Timeouts):</p>
            <div class="test-buttons-grid">
              <button id="test-slow" class="btn btn-test" title="Блокування потоку Node на 300мс (/api/slow)">🛑 Блокування Loop (300ms)</button>
              <button id="test-timeout" class="btn btn-test" title="AbortSignal.timeout(100ms)">⏱️ Таймаут (Timeout)</button>
              <button id="test-404" class="btn btn-test" title="Запит до неіснуючого маршруту 404">❌ Помилка 404 (No Retry)</button>
              <button id="test-abort" class="btn btn-test" title="controller.abort() посеред запиту">🛑 Скасування (Abort)</button>
              <button id="test-badjson" class="btn btn-test" title="Спроба розпарсити некоректний JSON">💥 Битий JSON</button>
              <button id="test-reset" class="btn btn-reset">✅ Відновити API</button>
            </div>
            <div id="test-log-output" class="test-log">Очікування команд...</div>
          </div>
        </div>

        <div class="lobby-footer">
          <div id="lobby-error-banner" class="error-banner hidden"></div>
          <button id="btn-join" class="btn btn-primary btn-launch">🚀 ПОЧАТИ ВИЛІТ (START MISSION)</button>
        </div>
      </div>
    `
  }

  #attachListeners() {
    const inputName = query<HTMLInputElement>(this.#container, '#pilot-name')
    inputName?.addEventListener('input', (e) => {
      this.#lobby.setPlayerName(inputName.value)
    })

    const btnRefresh = query(this.#container, '#btn-refresh')
    btnRefresh?.addEventListener('click', () => {
      this.#logTest('Ручний запит оновлення списку кімнат...')
      this.#lobby.refresh().catch((err) => {
        this.#logTest(`Помилка оновлення: ${errorMessage(err)}`, true)
      })
    })

    const btnJoin = query(this.#container, '#btn-join')
    btnJoin?.addEventListener('click', () => {
      const room = this.#lobby.join()
      Promise.resolve(this.#onJoinCallback?.(room))
        .then(() => this.hide())
        .catch(console.error)
    })

    // Чат форма
    const chatForm = query(this.#container, '#chat-form')
    const chatInput = query<HTMLInputElement>(this.#container, '#chat-input')
    chatForm?.addEventListener('submit', (e) => {
      e.preventDefault()
      const text = chatInput.value.trim()
      if (text) {
        gameConnection.sendChat(text)
        chatInput.value = ''
      }
    })

    // Тестові кнопки failure gallery
    this.#setupFailureGalleryButtons()

    // Підписка на події моделі Lobby (EventTarget)
    this.#lobby.on('roomsUpdated', (e) => {
      this.#renderRooms(e.rooms, e.selectedRoomId)
    })

    this.#lobby.on('statusChanged', (e) => {
      this.#updateStatusIndicator(e.status)
    })

    this.#lobby.on('roomSelected', (e) => {
      this.#highlightSelectedRoom(e.roomId)
      // Підключаємо WebSocket до обраної кімнати
      gameConnection.connect(e.roomId, this.#lobby.playerName)
    })

    this.#lobby.on('error', (e) => {
      this.#showError(errorMessage(e.error))
    })

    this.#lobby.on('aborted', (e) => {
      this.#logTest(`[AbortController] Запит скасовано: ${e.reason}`)
    })
  }

  #attachWebSocketListeners() {
    const statusBadge = query(this.#container, '#ws-status-badge')

    gameConnection.on('status', (e) => {
      const s = e.status
      if (!statusBadge) return
      if (s === 'connected') {
        statusBadge.textContent = '● В ефірі'
        statusBadge.className = 'ws-badge ws-connected'
      } else if (s === 'connecting') {
        statusBadge.textContent = '○ Зв’язок...'
        statusBadge.className = 'ws-badge ws-connecting'
      } else {
        statusBadge.textContent = '● Відключено'
        statusBadge.className = 'ws-badge ws-disconnected'
      }
    })

    gameConnection.on('welcome', (e) => {
      this.#appendChatMessage({
        from: 'СИСТЕМА',
        text: `З'єднано з сектором ${e.room?.name || ''}. Ваш ID: ${e.playerId}`,
        isSystem: true,
      })
      this.#renderRoster(e.roster || [])
    })

    gameConnection.on('roster', (e) => {
      this.#renderRoster(e.players || [])
    })

    gameConnection.on('joined', (e) => {
      const name = e.player?.name || 'Пілот'
      this.#appendChatMessage({
        from: 'СИСТЕМА',
        text: `${name} вийшов на зв'язок.`,
        isSystem: true,
      })
      if (e.roster) this.#renderRoster(e.roster)
    })

    gameConnection.on('left', (e) => {
      const name = e.name || 'Пілот'
      this.#appendChatMessage({
        from: 'СИСТЕМА',
        text: `${name} залишив частоту.`,
        isSystem: true,
      })
      if (e.roster) this.#renderRoster(e.roster)
    })

    gameConnection.on('chat', (e) => {
      this.#appendChatMessage(e)
    })

    gameConnection.on('shutdown', (e) => this.#showError(e.message))
    gameConnection.on('reconnectFailed', () =>
      this.#showError('Connection lost. Select a sector to reconnect.'),
    )
    gameConnection.on('error', (e) => {
      this.#appendChatMessage({
        from: 'ПОМИЛКА',
        text: e.message || 'Збій протоколу',
        isError: true,
      })
    })
  }

  #renderRoster(players: readonly { id: string; name: string }[]) {
    const list = query(this.#container, '#roster-list')
    if (!list) return

    if (!players || players.length === 0) {
      list.innerHTML = '<li class="roster-empty">Немає пілотів у секторі</li>'
      return
    }

    list.innerHTML = players
      .map(
        (p) =>
          `<li class="roster-item"><span class="pilot-dot">●</span> ${escapeHtml(p.name)}</li>`,
      )
      .join('')
  }

  #appendChatMessage({
    from,
    text,
    isSystem,
    isError,
  }: {
    from: string
    text: string
    isSystem?: boolean
    isError?: boolean
  }) {
    const chatBox = query(this.#container, '#chat-messages')
    if (!chatBox) return

    const el = document.createElement('div')
    el.className = isError
      ? 'chat-error'
      : isSystem
        ? 'chat-system'
        : 'chat-line'
    el.textContent = `${from}: ${text}`

    chatBox.appendChild(el)
    chatBox.scrollTop = chatBox.scrollHeight
  }

  #setupFailureGalleryButtons() {
    // 0. Тест Блокування Event Loop (Lab 04 M4)
    query(this.#container, '#test-slow')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#logTest(
          'Відправка GET /api/slow?ms=300 (блокуючий цикл на сервері)...',
        )
        const t0 = performance.now()
        try {
          const res = await fetch('/api/slow?ms=300')
          const data: unknown = await res.json()
          if (
            !data ||
            typeof data !== 'object' ||
            !('blockedMs' in data) ||
            typeof data.blockedMs !== 'number'
          )
            throw new Error('Invalid slow response')
          const dt = (performance.now() - t0).toFixed(1)
          this.#logTest(
            `[Node Single-Thread]: Сервер блокував потік на ${data.blockedMs}ms. Загальний час: ${dt}ms!`,
          )
        } catch (err) {
          this.#logTest(`Помилка запиту: ${errorMessage(err)}`, true)
        }
      }),
    )

    // 1. Тест Таймауту
    query(this.#container, '#test-timeout')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#logTest(
          'Запуск запиту з жорстким таймаутом AbortSignal.timeout(100ms)...',
        )
        try {
          await this.#lobby.refresh({ timeoutMs: 100 })
        } catch (err) {
          this.#logTest(
            `Зловлено таймаут: ${err instanceof Error ? err.name : 'Error'} — ${errorMessage(err)}`,
            true,
          )
        }
      }),
    )

    // 2. Тест 404
    query(this.#container, '#test-404')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#lobby.setApiUrl('/api/non-existent-sector-404.json')
        this.#logTest(
          'Встановлено URL 404. fetchJson перевіряє response.ok, withRetry не повторює 4xx.',
        )
        try {
          await this.#lobby.refresh()
        } catch (err) {
          this.#logTest(
            `Очікувана 404: ${err instanceof Error ? err.name : 'Error'} (${errorMessage(err)}) — спроби повтору заблоковано!`,
            true,
          )
        }
      }),
    )

    // 3. Тест AbortController
    query(this.#container, '#test-abort')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#logTest(
          'Запуск запиту та негайне скасування через controller.abort()...',
        )
        const refreshPromise = this.#lobby.refresh()
        this.#lobby.stopPolling()
        try {
          await refreshPromise
        } catch (err) {
          this.#logTest(
            `Операцію скасовано: ${err instanceof Error ? err.name : 'Error'}`,
            true,
          )
        }
      }),
    )

    // 4. Тест Corrupt JSON
    query(this.#container, '#test-badjson')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#lobby.setApiUrl('/assets/sprites.png')
        this.#logTest('Спроба розпарсити бінарний PNG як JSON...')
        try {
          await this.#lobby.refresh()
        } catch (err) {
          this.#logTest(
            `Помилка парсингу JSON: ${err instanceof Error ? err.name : 'Error'} (${errorMessage(err)})`,
            true,
          )
        }
      }),
    )

    // 5. Відновлення normal API
    query(this.#container, '#test-reset')?.addEventListener(
      'click',
      handleAsync(async () => {
        this.#lobby.setApiUrl('/api/rooms')
        this.#logTest('URL скинуто до робочого: /api/rooms')
        this.#hideError()
        await this.#lobby.refresh().catch(() => {})
      }),
    )
  }

  #logTest(msg: string, isError = false) {
    const logEl = query(this.#container, '#test-log-output')
    if (logEl) {
      logEl.style.color = isError ? '#f87171' : '#38bdf8'
      logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
    }
  }

  #renderRooms(rooms: RoomData[], selectedId: string | null) {
    const list = query(this.#container, '#rooms-list')
    if (!list) return

    if (!rooms || rooms.length === 0) {
      list.innerHTML =
        '<div class="room-empty">Немає доступних секторів на сервері.</div>'
      return
    }

    list.innerHTML = rooms
      .map((r) => {
        const isSelected = r.id === selectedId
        const diffColor =
          r.difficulty === 'Normal'
            ? '#22c55e'
            : r.difficulty === 'Hard'
              ? '#eab308'
              : '#ef4444'

        return `
        <div class="room-card ${isSelected ? 'selected' : ''}" data-room-id="${escapeHtml(r.id)}">
          <div class="room-header-row">
            <h3 class="room-name">${escapeHtml(r.name)}</h3>
            <span class="room-ping">⚡ ${'—'} ms</span>
          </div>
          <div class="room-meta-row">
            <span class="room-players">👥 Пілоти: <strong>${r.players}/${r.maxPlayers}</strong></span>
            <span class="room-difficulty" style="color: ${diffColor}">Складність: ${escapeHtml(r.difficulty)}</span>
          </div>
        </div>
      `
      })
      .join('')

    list.querySelectorAll<HTMLElement>('.room-card').forEach((card) => {
      card.addEventListener('click', () => {
        const roomId = card.getAttribute('data-room-id')
        if (roomId) this.#lobby.selectRoom(roomId)
      })
    })

    this.#hideError()
  }

  #highlightSelectedRoom(selectedId: string | null) {
    const list = query(this.#container, '#rooms-list')
    if (!list) return
    list.querySelectorAll<HTMLElement>('.room-card').forEach((card) => {
      if (card.getAttribute('data-room-id') === selectedId) {
        card.classList.add('selected')
      } else {
        card.classList.remove('selected')
      }
    })
  }

  #updateStatusIndicator(status: string) {
    const ind = query(this.#container, '#lobby-status-indicator')
    const btn = query(this.#container, '#btn-refresh')
    if (!ind) return

    if (status === 'fetching') {
      ind.textContent = 'Оновлення...'
      ind.className = 'status-indicator status-fetching'
      if (btn) btn.setAttribute('disabled', 'true')
    } else if (status === 'error') {
      ind.textContent = 'Помилка мережі'
      ind.className = 'status-indicator status-error'
      if (btn) btn.removeAttribute('disabled')
    } else {
      ind.textContent = 'Онлайн'
      ind.className = 'status-indicator status-online'
      if (btn) btn.removeAttribute('disabled')
    }
  }

  #showError(msg: string) {
    const banner = query(this.#container, '#lobby-error-banner')
    if (banner) {
      banner.textContent = `Увага: ${msg}`
      banner.classList.remove('hidden')
    }
  }

  #hideError() {
    const banner = query(this.#container, '#lobby-error-banner')
    if (banner) {
      banner.classList.add('hidden')
    }
  }

  show() {
    if (this.#container) {
      this.#container.classList.remove('hidden')
    }
  }

  hide() {
    if (this.#container) {
      this.#container.classList.add('hidden')
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  )
}
