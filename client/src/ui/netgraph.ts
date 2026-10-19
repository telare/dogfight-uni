import type { GameConnection } from '../net/connection.ts'
import type { PredictionManager } from '../net/prediction.ts'
import type { InterpolationManager } from '../net/interpolation.ts'
import { query } from '../dom.ts'
/**
 * Dogfight Client — Netgraph & Latency Telemetry Overlay (Lab 05 M1-M4)
 *
 * Відображає:
 * 1. RTT (Ping) у мілісекундах та графік історії пінгів.
 * 2. Частоту авторитетних знімків (Hz) та вік останнього знімка.
 * 3. Трафік: KB/s In (down), KB/s Out (up), розмір останнього фрейму в байтах.
 * 4. Кількість непідтверджених команд у черзі (Pending Inputs).
 * 5. Магнітуду виправлення розсинхрону (Reconciliation Correction, px).
 * 6. Інтерактивні перемикачі:
 *    - Codec: Binary (DataView) vs JSON
 *    - Prediction: УВІМК / ВИМК («дурний клієнт»)
 *    - Reconciliation & Smoothing: УВІМК / ВИМК
 *    - Interpolation: УВІМК / ВИМК
 *    - Слайдери штучної затримки (0-300 мс), джиттеру (0-50 мс), дропу (0-15%)
 *    - Кнопка «Штучний десинхрон» для наочної перевірки звірки
 */

export class Netgraph {
  connection: GameConnection
  prediction: PredictionManager
  interpolation: InterpolationManager

  visible: boolean

  constructor({
    gameConnection,
    predictionManager,
    interpolationManager,
  }: {
    gameConnection: GameConnection
    predictionManager: PredictionManager
    interpolationManager: InterpolationManager
  }) {
    this.connection = gameConnection
    this.prediction = predictionManager
    this.interpolation = interpolationManager
    this.visible = true

    this.#initDOM()
  }

  toggle() {
    this.visible = !this.visible
    if (this.#container) {
      this.#container.style.display = this.visible ? 'block' : 'none'
    }
  }

  #container!: HTMLElement
  #canvas!: HTMLCanvasElement
  #ctx: CanvasRenderingContext2D | null = null
  #metricsEl!: HTMLElement

  #initDOM() {
    let el = document.querySelector<HTMLElement>('#netgraph-overlay')
    if (!el) {
      el = document.createElement('div')
      el.id = 'netgraph-overlay'
      el.className = 'netgraph-overlay'
      document.body.appendChild(el)
    }
    this.#container = el

    this.#container.innerHTML = `
      <div class="netgraph-card">
        <div class="netgraph-header">
          <div class="netgraph-title-row">
            <span class="netgraph-badge">NETGRAPH // LAB 05</span>
            <span id="ng-codec-badge" class="badge-binary">● BINARY DATAVIEW</span>
          </div>
          <button id="ng-close-btn" class="ng-btn-close" title="Сховати/Показати [N]">✕</button>
        </div>

        <div class="netgraph-body">
          <canvas id="ng-chart" class="ng-chart-canvas" width="280" height="50"></canvas>

          <div id="ng-metrics" class="ng-metrics-grid">
            <!-- Динамічні показники -->
          </div>

          <div class="ng-controls-section">
            <div class="ng-toggles-row">
              <label class="ng-toggle-label">
                <input type="checkbox" id="ng-toggle-pred" checked />
                <span>Prediction</span>
              </label>
              <label class="ng-toggle-label">
                <input type="checkbox" id="ng-toggle-recon" checked />
                <span>Recon+Smooth</span>
              </label>
              <label class="ng-toggle-label">
                <input type="checkbox" id="ng-toggle-interp" checked />
                <span>Interpolate</span>
              </label>
            </div>

            <div class="ng-codec-toggle-row">
              <button id="ng-btn-codec" class="ng-btn-toggle">Перемкнути: JSON ↔ Binary</button>
            </div>

            <div class="ng-sliders-group">
              <div class="ng-slider-row">
                <label for="ng-latency-slider">Штучна затримка: <span id="ng-latency-val">0</span> ms</label>
                <input type="range" id="ng-latency-slider" min="0" max="300" step="10" value="0" />
              </div>
              <div class="ng-slider-row">
                <label for="ng-jitter-slider">Джиттер: <span id="ng-jitter-val">0</span> ms</label>
                <input type="range" id="ng-jitter-slider" min="0" max="50" step="5" value="0" />
              </div>
              <div class="ng-slider-row">
                <label for="ng-drop-slider">Втрата пакетів: <span id="ng-drop-val">0</span> %</label>
                <input type="range" id="ng-drop-slider" min="0" max="15" step="1" value="0" />
              </div>
            </div>

            <div class="ng-action-buttons">
              <button id="ng-btn-desync" class="ng-btn-action" title="Зсунути позицію на +75px для спостереження звірки">💥 Штучний десинхрон</button>
            </div>
          </div>
        </div>
      </div>
    `

    this.#canvas = query<HTMLCanvasElement>(this.#container, '#ng-chart')
    this.#ctx = this.#canvas?.getContext('2d')
    this.#metricsEl = query(this.#container, '#ng-metrics')

    this.#attachListeners()
  }

  #attachListeners() {
    // Гаряча клавіша 'N' для приховування / показу
    query(this.#container, '#ng-close-btn')?.addEventListener('click', () => {
      this.toggle()
    })

    // Prediction toggle
    const predCheckbox = query<HTMLInputElement>(
      this.#container,
      '#ng-toggle-pred',
    )
    predCheckbox?.addEventListener('change', (e) => {
      this.prediction.enabled =
        e.currentTarget instanceof HTMLInputElement && e.currentTarget.checked
    })

    // Reconciliation toggle
    const reconCheckbox = query<HTMLInputElement>(
      this.#container,
      '#ng-toggle-recon',
    )
    reconCheckbox?.addEventListener('change', (e) => {
      this.prediction.reconciliationEnabled =
        e.currentTarget instanceof HTMLInputElement && e.currentTarget.checked
      this.prediction.smoothingEnabled =
        e.currentTarget instanceof HTMLInputElement && e.currentTarget.checked
    })

    // Interpolation toggle
    const interpCheckbox = query<HTMLInputElement>(
      this.#container,
      '#ng-toggle-interp',
    )
    interpCheckbox?.addEventListener('change', (e) => {
      this.interpolation.enabled =
        e.currentTarget instanceof HTMLInputElement && e.currentTarget.checked
    })

    // Codec toggle
    const btnCodec = query(this.#container, '#ng-btn-codec')
    btnCodec?.addEventListener('click', () => {
      const nextCodec = this.connection.codec === 'binary' ? 'json' : 'binary'
      this.connection.updateConfig({ codec: nextCodec })
      this.#updateCodecBadge()
    })

    // Sliders
    const latencySlider = query<HTMLInputElement>(
      this.#container,
      '#ng-latency-slider',
    )
    const latencyVal = query(this.#container, '#ng-latency-val')
    latencySlider?.addEventListener('input', (e) => {
      const ms = Number(
        e.currentTarget instanceof HTMLInputElement ? e.currentTarget.value : 0,
      )
      latencyVal.textContent = String(ms)
      this.connection.updateConfig({ latencyMs: ms })
    })

    const jitterSlider = query<HTMLInputElement>(
      this.#container,
      '#ng-jitter-slider',
    )
    const jitterVal = query(this.#container, '#ng-jitter-val')
    jitterSlider?.addEventListener('input', (e) => {
      const ms = Number(
        e.currentTarget instanceof HTMLInputElement ? e.currentTarget.value : 0,
      )
      jitterVal.textContent = String(ms)
      this.connection.updateConfig({ jitterMs: ms })
    })

    const dropSlider = query<HTMLInputElement>(
      this.#container,
      '#ng-drop-slider',
    )
    const dropVal = query(this.#container, '#ng-drop-val')
    dropSlider?.addEventListener('input', (e) => {
      const pct = Number(
        e.currentTarget instanceof HTMLInputElement ? e.currentTarget.value : 0,
      )
      dropVal.textContent = String(pct)
      this.connection.updateConfig({ dropRate: pct / 100 })
    })

    // Desync injection button
    const btnDesync = query(this.#container, '#ng-btn-desync')
    btnDesync?.addEventListener('click', () => {
      this.prediction.injectDesync(80)
      console.log(
        '[Lab 05 Netcode Demo] Інʼєктовано +80px розсинхрону! Слідкуйте за корекцією в Netgraph.',
      )
    })
  }

  #updateCodecBadge() {
    const badge = query(this.#container, '#ng-codec-badge')
    if (badge) {
      if (this.connection.codec === 'binary') {
        badge.className = 'badge-binary'
        badge.textContent = '● BINARY DATAVIEW'
      } else {
        badge.className = 'badge-json'
        badge.textContent = '● JSON PROTOCOL'
      }
    }
  }

  /**
   * Оновлення телеметрії на кожному кадрі рендерингу
   */
  update() {
    if (!this.visible || !this.#metricsEl) return

    const now = performance.now()
    const snapAge =
      this.connection.lastSnapshotTime > 0
        ? Math.round(now - this.connection.lastSnapshotTime)
        : 0

    this.#updateCodecBadge()

    this.#metricsEl.innerHTML = `
      <div class="ng-metric-item">
        <span class="ng-label">RTT (Пінг):</span>
        <span class="ng-val ng-highlight">${this.connection.rtt} ms</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Знімки (Hz):</span>
        <span class="ng-val">${this.connection.snapshotsPerSec} Hz (${snapAge}ms age)</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Кадр знімка:</span>
        <span class="ng-val">${this.connection.lastSnapshotBytes} B</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Трафік Down:</span>
        <span class="ng-val">${this.connection.kbpsIn} kbps</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Трафік Up:</span>
        <span class="ng-val">${this.connection.kbpsOut} kbps</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Черга вводу:</span>
        <span class="ng-val">${this.prediction.pendingCount} unack</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Корекція (err):</span>
        <span class="ng-val ${this.prediction.lastCorrectionMagnitude > 5 ? 'ng-alert' : ''}">${this.prediction.lastCorrectionMagnitude} px (max: ${this.prediction.maxCorrectionMagnitude}px)</span>
      </div>
      <div class="ng-metric-item">
        <span class="ng-label">Delay інтерп.:</span>
        <span class="ng-val">${this.interpolation.interpolationDelayMs} ms</span>
      </div>
    `

    this.#drawChart()
  }

  #drawChart() {
    if (!this.#ctx || !this.#canvas) return
    const ctx = this.#ctx
    const w = this.#canvas.width
    const h = this.#canvas.height

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, w, h)

    // Сітка
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()

    // Графік історії RTT
    const history = this.connection.rttHistory
    if (history.length > 1) {
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.beginPath()
      const step = w / Math.max(1, history.length - 1)
      const maxVal = Math.max(150, ...history)

      for (let i = 0; i < history.length; i++) {
        const x = i * step
        const y = h - ((history[i] ?? 0) / maxVal) * (h - 6) - 3
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}
