/**
 * Dogfight — Модуль відображення лобі (Lobby View) у DOM (Lab 03)
 *
 * Вимоги архітектури:
 * 1. Відокремлений від Lobby модуль: Lobby керує станом та подіями, LobbyView слухає та малює DOM.
 * 2. Інтерфейс вибору кімнати, введення позивного, показ пінгу, заповненості та налаштувань арени.
 * 3. Інтерактивні кнопки для тестування Failure Gallery (404, таймаут, абортування, битий JSON).
 */

export class LobbyView {
  /** @type {import('./lobby.js').Lobby} */
  #lobby = null

  /** @type {HTMLElement|null} */
  #container = null

  #onJoinCallback = null

  constructor(lobby, { onJoin } = {}) {
    this.#lobby = lobby
    this.#onJoinCallback = onJoin
    this.#initDOM()
    this.#attachListeners()
  }

  #initDOM() {
    let overlay = document.querySelector('#lobby-overlay')
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
            <span class="lobby-badge">LAB 03 // ASYNC PIPELINE</span>
            <h1 class="lobby-title">DOGFIGHT // FLIGHT OPS</h1>
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

          <div class="lobby-test-section">
            <h3>🧪 ДЕМО ДЛЯ ЗАХИСТУ: ГАЛЕРЕЯ ПОМИЛОК ТА ТАЙМАУТІВ</h3>
            <p class="test-desc">Перевірка обробки збоїв мережі згідно зі специфікацією Lab 03:</p>
            <div class="test-buttons-grid">
              <button id="test-timeout" class="btn btn-test" title="AbortSignal.timeout(300ms)">⏱️ Таймаут (Timeout)</button>
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
    const inputName = this.#container.querySelector('#pilot-name')
    inputName?.addEventListener('input', (e) => {
      this.#lobby.setPlayerName(e.target.value)
    })

    const btnRefresh = this.#container.querySelector('#btn-refresh')
    btnRefresh?.addEventListener('click', () => {
      this.#logTest('Ручний запит оновлення списку кімнат...')
      this.#lobby.refresh().catch((err) => {
        this.#logTest(`Помилка оновлення: ${err.message}`, true)
      })
    })

    const btnJoin = this.#container.querySelector('#btn-join')
    btnJoin?.addEventListener('click', () => {
      const room = this.#lobby.join()
      this.#onJoinCallback?.(room)
      this.hide()
    })

    // Тестові кнопки failure gallery
    this.#setupFailureGalleryButtons()

    // Підписка на події моделі Lobby (EventTarget)
    this.#lobby.addEventListener('roomsUpdated', (e) => {
      this.#renderRooms(e.detail.rooms, e.detail.selectedRoomId)
    })

    this.#lobby.addEventListener('statusChanged', (e) => {
      this.#updateStatusIndicator(e.detail.status)
    })

    this.#lobby.addEventListener('roomSelected', (e) => {
      this.#highlightSelectedRoom(e.detail.roomId)
    })

    this.#lobby.addEventListener('error', (e) => {
      this.#showError(e.detail.error?.message || 'Не вдалося отримати сектори')
    })

    this.#lobby.addEventListener('aborted', (e) => {
      this.#logTest(`[AbortController] Запит скасовано: ${e.detail.reason}`)
    })
  }

  #setupFailureGalleryButtons() {
    // 1. Тест Таймауту
    this.#container
      .querySelector('#test-timeout')
      ?.addEventListener('click', async () => {
        this.#logTest(
          'Запуск запиту з жорстким таймаутом AbortSignal.timeout(100ms)...',
        )
        try {
          await this.#lobby.refresh({ timeoutMs: 100 })
        } catch (err) {
          this.#logTest(`Зловлено таймаут: ${err.name} — ${err.message}`, true)
        }
      })

    // 2. Тест 404 (Ніколи не повторювати 4xx!)
    this.#container
      .querySelector('#test-404')
      ?.addEventListener('click', async () => {
        this.#lobby.setApiUrl('/api/non-existent-sector-404.json')
        this.#logTest(
          'Встановлено URL 404. fetchJson перевіряє response.ok, withRetry не повторює 4xx.',
        )
        try {
          await this.#lobby.refresh()
        } catch (err) {
          this.#logTest(
            `Очікувана 404: ${err.name} (${err.message}) — спроби повтору заблоковано!`,
            true,
          )
        }
      })

    // 3. Тест AbortController
    this.#container
      .querySelector('#test-abort')
      ?.addEventListener('click', async () => {
        this.#logTest(
          'Запуск запиту та негайне скасування через controller.abort()...',
        )
        const refreshPromise = this.#lobby.refresh()
        // Штучно перериваємо
        this.#lobby.stopPolling()
        try {
          await refreshPromise
        } catch (err) {
          this.#logTest(`Операцію скасовано: ${err.name}`, true)
        }
      })

    // 4. Тест Corrupt JSON
    this.#container
      .querySelector('#test-badjson')
      ?.addEventListener('click', async () => {
        // Використовуємо існуючий файл звуку або картинки, де очікується JSON
        this.#lobby.setApiUrl('/assets/sprites.png')
        this.#logTest('Спроба розпарсити бінарний PNG як JSON...')
        try {
          await this.#lobby.refresh()
        } catch (err) {
          this.#logTest(
            `Помилка парсингу JSON: ${err.name} (${err.message})`,
            true,
          )
        }
      })

    // 5. Відновлення нормального API
    this.#container
      .querySelector('#test-reset')
      ?.addEventListener('click', async () => {
        this.#lobby.setApiUrl('/api/rooms.json')
        this.#logTest('URL скинуто до робочого: /api/rooms.json')
        this.#hideError()
        await this.#lobby.refresh().catch(() => {})
      })
  }

  #logTest(msg, isError = false) {
    const logEl = this.#container.querySelector('#test-log-output')
    if (logEl) {
      logEl.style.color = isError ? '#f87171' : '#38bdf8'
      logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
    }
  }

  #renderRooms(rooms, selectedId) {
    const list = this.#container.querySelector('#rooms-list')
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
        <div class="room-card ${isSelected ? 'selected' : ''}" data-room-id="${r.id}">
          <div class="room-header-row">
            <h3 class="room-name">${r.name}</h3>
            <span class="room-ping">⚡ ${r.pingMs || 20} ms</span>
          </div>
          <div class="room-meta-row">
            <span class="room-players">👥 Пілоти: <strong>${r.players}/${r.maxPlayers}</strong></span>
            <span class="room-difficulty" style="color: ${diffColor}">Складність: ${r.difficulty}</span>
          </div>
        </div>
      `
      })
      .join('')

    // Додаємо клік вибору картки
    list.querySelectorAll('.room-card').forEach((card) => {
      card.addEventListener('click', () => {
        const roomId = card.getAttribute('data-room-id')
        this.#lobby.selectRoom(roomId)
      })
    })

    this.#hideError()
  }

  #highlightSelectedRoom(selectedId) {
    const list = this.#container.querySelector('#rooms-list')
    if (!list) return
    list.querySelectorAll('.room-card').forEach((card) => {
      if (card.getAttribute('data-room-id') === selectedId) {
        card.classList.add('selected')
      } else {
        card.classList.remove('selected')
      }
    })
  }

  #updateStatusIndicator(status) {
    const ind = this.#container.querySelector('#lobby-status-indicator')
    const btn = this.#container.querySelector('#btn-refresh')
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

  #showError(msg) {
    const banner = this.#container.querySelector('#lobby-error-banner')
    if (banner) {
      banner.textContent = `Увага: ${msg}`
      banner.classList.remove('hidden')
    }
  }

  #hideError() {
    const banner = this.#container.querySelector('#lobby-error-banner')
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
