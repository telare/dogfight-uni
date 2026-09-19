/**
 * Dogfight — HUD (Heads-Up Display) модуль (Lab 03)
 *
 * Вимоги розчеплення (Decoupling):
 * Симуляція (World, Ship, Collision) НЕ імпортує HUD.
 * HUD підписується на CustomEvents від World ('score', 'hit', 'exploded', 'pickup', 'respawn').
 */

export class HudController {
  #score = 0
  #scorePops = []
  #unsubscribers = []
  #recentFeed = []

  constructor() {
    this.arenaName = 'Standard Sector'
    this.playerName = 'Pilot'
  }

  get score() {
    return this.#score
  }

  /**
   * Підписка на події світу через EventTarget
   * @param {EventTarget} emitter
   */
  subscribeToWorld(emitter) {
    this.unsubscribe()
    if (!emitter || typeof emitter.addEventListener !== 'function') return

    const onScore = (e) => {
      const { score, delta, pos } = e.detail || {}
      if (typeof score === 'number') {
        this.#score = score
      }
      if (delta) {
        this.#scorePops.push({
          text: `+${delta}`,
          x: pos ? pos.x : 200,
          y: pos ? pos.y : 100,
          alpha: 1.0,
          life: 0.9,
        })
      }
    }

    const onPickup = (e) => {
      const type = e.detail?.type || 'bonus'
      this.#addFeed(`Отримано бонус: ${type.toUpperCase()}`, '#38bdf8')
    }

    const onExploded = (e) => {
      const kind = e.detail?.kind || 'сутності'
      if (kind === 'ship') {
        this.#addFeed('Корабель знищено! Відлік відродження...', '#f87171')
      }
    }

    const onRespawn = () => {
      this.#addFeed('Корабель відроджено! Активовано щит.', '#4ade80')
    }

    emitter.addEventListener('score', onScore)
    emitter.addEventListener('pickup', onPickup)
    emitter.addEventListener('exploded', onExploded)
    emitter.addEventListener('respawn', onRespawn)

    this.#unsubscribers.push(
      () => emitter.removeEventListener('score', onScore),
      () => emitter.removeEventListener('pickup', onPickup),
      () => emitter.removeEventListener('exploded', onExploded),
      () => emitter.removeEventListener('respawn', onRespawn),
    )
  }

  #addFeed(text, color = '#94a3b8') {
    this.#recentFeed.unshift({ text, color, time: Date.now() })
    if (this.#recentFeed.length > 3) {
      this.#recentFeed.pop()
    }
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

  /**
   * Оновлення внутрішніх анімацій HUD (дельта спливаючих написів)
   * @param {number} dt
   */
  update(dt) {
    for (let i = this.#scorePops.length - 1; i >= 0; i--) {
      const pop = this.#scorePops[i]
      pop.life -= dt
      pop.y -= 25 * dt
      pop.alpha = Math.max(0, pop.life / 0.9)
      if (pop.life <= 0) {
        this.#scorePops.splice(i, 1)
      }
    }
  }

  /**
   * Відмалювання плашки HUD та спливаючих написів
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} stats
   * @param {import('../sim/world.js').World} world
   * @param {import('../sim/ship.js').Ship} ship
   * @param {boolean} isAudioUnlocked
   */
  render(ctx, stats, world, ship, isAudioUnlocked) {
    ctx.save()

    // Відмалювання спливаючих нарахувань очок у світі
    for (const pop of this.#scorePops) {
      ctx.fillStyle = `rgba(251, 191, 36, ${pop.alpha})`
      ctx.font = 'bold 15px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(pop.text, pop.x, pop.y)
    }

    // Головна панель HUD
    const hudW = 390
    const hudH = 264
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)'
    if (ctx.roundRect) {
      ctx.roundRect(16, 16, hudW, hudH, 8)
    } else {
      ctx.rect(16, 16, hudW, hudH)
    }
    ctx.fill()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace'

    // Лічильники продуктивності
    ctx.fillStyle = stats.stepsPerSecond >= 58 ? '#4ade80' : '#f87171'
    ctx.fillText(`steps/s  ${stats.stepsPerSecond}`, 28, 38)

    ctx.fillStyle = '#60a5fa'
    ctx.fillText(`frames/s ${stats.framesPerSecond}`, 148, 38)

    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`ms: ${stats.frameTimeMs.toFixed(1)}`, 270, 38)

    // Стан здоров'я
    const hp = ship ? ship.hp : 0
    const maxHp = ship ? ship.maxHp : 100
    const shield = ship ? ship.shield : 0

    ctx.fillStyle = '#334155'
    ctx.fillRect(28, 50, 160, 10)
    const hpWidth = Math.max(0, (hp / maxHp) * 160)
    ctx.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#eab308' : '#ef4444'
    ctx.fillRect(28, 50, hpWidth, 10)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(`HP: ${hp}/${maxHp}`, 196, 59)

    if (shield > 0) {
      ctx.fillStyle = '#38bdf8'
      ctx.fillText(`SHIELD: ${shield}`, 282, 59)
    }

    // Очки (отримані через CustomEvent від World)
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = '#fbbf24'
    const displayScore = Math.max(this.#score, ship ? ship.score : 0)
    ctx.fillText(`Рахунок: ${displayScore}`, 28, 80)

    ctx.fillStyle = '#c084fc'
    ctx.fillText(
      `Сутності: ${world ? world.size : 0} (Map<id, Entity>)`,
      170,
      80,
    )

    // Аудіо індикатор (Lab 03 Web Audio)
    ctx.font = '11px ui-monospace, monospace'
    if (isAudioUnlocked) {
      ctx.fillStyle = '#4ade80'
      ctx.fillText('🔊 Web Audio: Активне (розблоковано)', 28, 100)
    } else {
      ctx.fillStyle = '#f59e0b'
      ctx.fillText('🔇 Web Audio: Заблоковано (клікніть для звуку)', 28, 100)
    }

    // Стан гравця / Відродження
    if (world && world.respawnTimer > 0) {
      ctx.fillStyle = '#f87171'
      ctx.font = 'bold 13px ui-monospace, monospace'
      ctx.fillText(
        `ВІДРОДЖЕННЯ ЧЕРЕЗ: ${world.respawnTimer.toFixed(1)} с`,
        28,
        122,
      )
    } else {
      const buffs = []
      if (ship && ship.rapidFireTimer > 0)
        buffs.push(`Швидкостріл (${ship.rapidFireTimer.toFixed(1)}s)`)
      if (ship && ship.homingTimer > 0)
        buffs.push(`Самонаведення (${ship.homingTimer.toFixed(1)}s)`)

      ctx.fillStyle = '#38bdf8'
      ctx.fillText(
        buffs.length > 0
          ? `Бонуси: ${buffs.join(' · ')}`
          : `Арена: ${this.arenaName}`,
        28,
        122,
      )
    }

    // Останні повідомлення
    let feedY = 142
    for (const msg of this.#recentFeed.slice(0, 2)) {
      ctx.fillStyle = msg.color
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(`› ${msg.text}`, 28, feedY)
      feedY += 16
    }

    // Гарячі клавіші
    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText('WASD: рух · Space: вогонь · Esc: лобі/пауза', 28, 184)
    ctx.fillText('[K] Баг this · [H] Homing Asteroid · [P] Bonus', 28, 202)
    ctx.fillText('[L] Повернутись до лобі · [B] Тест бенчмарку', 28, 220)

    if (stats.lastThisBugLog) {
      ctx.fillStyle = stats.lastThisBugSuccess ? '#4ade80' : '#f87171'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(stats.lastThisBugLog, 28, 244)
    }

    ctx.restore()
  }
}

export const hudController = new HudController()
