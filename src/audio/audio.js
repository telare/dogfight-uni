/**
 * Dogfight — Аудіосистема на базі Web Audio API (Lab 03)
 *
 * Вимоги специфікації:
 * 1. Модуль володіє AudioContext і завантажує декодовані AudioBuffer.
 * 2. Контекст розблоковується після першого жесту користувача (click / keydown).
 * 3. Повне розчеплення із симуляцією: симуляція (World, Ship, Collision)
 *    НЕ імпортує аудіомодуль. Аудіо підписується на події через EventTarget (CustomEvent).
 */

export class SoundSystem {
  /** @type {AudioContext|null} */
  #ctx = null

  /** @type {Map<string, AudioBuffer>} */
  #buffers = new Map()

  #isUnlocked = false
  #unsubscribers = []

  /**
   * Отримання або лінива ініціалізація AudioContext
   * @returns {AudioContext}
   */
  get context() {
    if (!this.#ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        this.#ctx = new AudioCtx()
      }
    }
    return this.#ctx
  }

  get isUnlocked() {
    return this.#isUnlocked && this.#ctx?.state === 'running'
  }

  /**
   * Збереження попередньо декодованих AudioBuffer
   * @param {Record<string, AudioBuffer>} soundMap
   */
  setBuffers(soundMap) {
    if (!soundMap) return
    for (const [name, buffer] of Object.entries(soundMap)) {
      if (buffer) {
        this.#buffers.set(name, buffer)
      }
    }
  }

  /**
   * Розблокування Web Audio контексту за жестом користувача.
   * Браузери блокують відтворення аудіо до взаємодії зі сторінкою.
   *
   * @returns {Promise<boolean>}
   */
  async unlock() {
    const ctx = this.context
    if (!ctx) return false

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch (err) {
        console.warn('[WebAudio] Не вдалося розблокувати контекст:', err)
      }
    }

    if (ctx.state === 'running') {
      this.#isUnlocked = true
      return true
    }

    return false
  }

  /**
   * Миттєве відтворення звуку через AudioBufferSourceNode з нульовою затримкою.
   *
   * @param {string} name - Ідентифікатор звуку ('laser', 'hit', 'explosion', 'pickup')
   * @param {Object} [options]
   * @param {number} [options.volume=0.5]
   * @param {number} [options.rate=1.0]
   * @param {number} [options.detune=0]
   */
  play(name, { volume = 0.5, rate = 1.0, detune = 0 } = {}) {
    if (!this.#isUnlocked || !this.#ctx || this.#ctx.state !== 'running') {
      return
    }

    const buffer = this.#buffers.get(name)
    if (!buffer) {
      return
    }

    try {
      const source = this.#ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = rate
      if (detune !== 0 && source.detune) {
        source.detune.value = detune
      }

      const gain = this.#ctx.createGain()
      gain.gain.value = Math.max(0, Math.min(1, volume))

      source.connect(gain)
      gain.connect(this.#ctx.destination)

      source.start(0)
    } catch (err) {
      console.warn(`[WebAudio] Помилка відтворення ${name}:`, err)
    }
  }

  /**
   * Підписка на події світу через EventTarget (CustomEvent).
   * Симуляція нічого не знає про аудіо; аудіо слухає диспетчер подій світу.
   *
   * @param {EventTarget} emitter
   */
  subscribeToWorld(emitter) {
    this.unsubscribe()
    if (!emitter || typeof emitter.addEventListener !== 'function') return

    const onFired = () => {
      this.play('laser', {
        volume: 0.28,
        rate: 0.95 + Math.random() * 0.1,
      })
    }

    const onHit = () => {
      this.play('hit', {
        volume: 0.4,
        rate: 0.9 + Math.random() * 0.2,
      })
    }

    const onExploded = (e) => {
      const isShip = e.detail?.kind === 'ship'
      this.play('explosion', {
        volume: isShip ? 0.65 : 0.45,
        rate: isShip ? 0.8 : 0.95 + Math.random() * 0.15,
      })
    }

    const onPickup = () => {
      this.play('pickup', {
        volume: 0.5,
      })
    }

    emitter.addEventListener('fired', onFired)
    emitter.addEventListener('hit', onHit)
    emitter.addEventListener('exploded', onExploded)
    emitter.addEventListener('pickup', onPickup)

    this.#unsubscribers.push(
      () => emitter.removeEventListener('fired', onFired),
      () => emitter.removeEventListener('hit', onHit),
      () => emitter.removeEventListener('exploded', onExploded),
      () => emitter.removeEventListener('pickup', onPickup),
    )
  }

  /**
   * Очищення підписок
   */
  unsubscribe() {
    for (const unsub of this.#unsubscribers) {
      unsub()
    }
    this.#unsubscribers = []
  }
}

export const soundSystem = new SoundSystem()
