/**
 * Dogfight Client — Client-Side Prediction, Server Reconciliation & Smoothing (Lab 05 M2)
 *
 * Принцип роботи (Gabriel Gambetta / Valve / Overwatch):
 * 1. Prediction: локальний гравець миттєво застосовує власні команди (Input) до свого корабля.
 *    Корабель реагує з 0 мс затримки, не чекаючи RTT.
 * 2. Буферизація: непогоджені команди зберігаються у черзі pendingInputs із sequence number (seq).
 * 3. Server Reconciliation: коли приходить авторитетний знімок сервера з ackSeq,
 *    клієнт скидає старі команди (seq <= ackSeq), скидає корабель у стан сервера
 *    та повторно програє (replay) усі залишені команди.
 * 4. Error Smoothing: якщо виявлено розбіжність (похибку), замість різкого «відскоку» (rubber-banding)
 *    додається плавний візуальний зсув (visualOffset), який згасає за експонентою за ~100 мс.
 */

import { Vector2, wrap } from 'shared'

export class PredictionManager {
  constructor() {
    this.enabled = true
    this.reconciliationEnabled = true
    this.smoothingEnabled = true

    this.seq = 0
    this.pendingInputs = []

    // Візуальне згладжування виправлень
    this.visualOffset = Vector2.zero()
    this.smoothingDecayRate = 14 // ~100 мс час згасання

    // Метрики для Netgraph
    this.lastCorrectionMagnitude = 0
    this.maxCorrectionMagnitude = 0
    this.totalReconciliations = 0
    this.lastReplayCount = 0

    // Прапорець для експерименту штучного розсинхрону
    this.injectedDrift = 0
  }

  get pendingCount() {
    return this.pendingInputs.length
  }

  reset() {
    this.seq = 0
    this.pendingInputs = []
    this.visualOffset = Vector2.zero()
    this.lastCorrectionMagnitude = 0
    this.maxCorrectionMagnitude = 0
  }

  /**
   * Застосування та передбачення локального кроку керування
   * @param {{ thrust: number, turn: number, fire: boolean }} input
   * @param {number} dt
   * @param {import('shared').World} world
   * @param {import('shared').Ship} localShip
   * @returns {number} seq поточного вводу
   */
  predictStep(input, dt, world, localShip) {
    this.seq++

    if (!localShip || !localShip.alive) {
      return this.seq
    }

    if (this.enabled) {
      // Застосовуємо введення через спільну фізичну симуляцію
      localShip.stepInput(input, dt, world)

      // Штучний дрейф для експерименту з порушенням детермінізму
      if (this.injectedDrift !== 0) {
        localShip.pos = localShip.pos.add(
          new Vector2(this.injectedDrift, this.injectedDrift),
        )
        this.injectedDrift = 0
      }

      wrap(localShip, world.arenaWidth, world.arenaHeight)

      // Зберігаємо непідтверджену команду в чергу
      this.pendingInputs.push({
        seq: this.seq,
        input: { ...input },
        dt,
        predictedPos: localShip.pos.clone(),
        predictedAngle: localShip.angle,
      })
    }

    return this.seq
  }

  /**
   * Звірка стану з авторитетним знімком сервера (Server Reconciliation)
   * @param {Object} snapshot
   * @param {import('shared').Ship} localShip
   * @param {import('shared').World} world
   */
  reconcile(snapshot, localShip, world) {
    if (!localShip || !snapshot) return

    const ackSeq = snapshot.ackSeq || 0

    // Видаляємо всі команди, які сервер уже врахував
    this.pendingInputs = this.pendingInputs.filter((item) => item.seq > ackSeq)

    if (!this.enabled || !this.reconciliationEnabled) {
      return
    }

    // Шукаємо наш корабель у списку сутностей знімка сервера
    const snapEntities = snapshot.entities || []
    const authoritativeShip = snapEntities.find(
      (e) => e.kind === 'ship' && e.id === localShip.id,
    )

    if (!authoritativeShip) return

    const posBeforeRecon = localShip.pos.clone()

    // 1. Встановлюємо стан корабля у точний авторитетний стан сервера
    localShip.pos = new Vector2(authoritativeShip.x, authoritativeShip.y)
    localShip.vel = new Vector2(authoritativeShip.vx, authoritativeShip.vy)
    localShip.angle = authoritativeShip.angle
    localShip.setHp?.(authoritativeShip.hp)
    localShip.shield = authoritativeShip.shield

    // 2. Повторно застосовуємо (Replay) усі непідтверджені команди
    this.lastReplayCount = this.pendingInputs.length
    for (const pending of this.pendingInputs) {
      localShip.stepInput(pending.input, pending.dt, world)
      wrap(localShip, world.arenaWidth, world.arenaHeight)
    }

    // 3. Розрахунок магнітуди корекції (похибки передбачення з урахуванням тороїдальної арени)
    let dx = Math.abs(posBeforeRecon.x - localShip.pos.x)
    if (dx > world.arenaWidth / 2) dx = world.arenaWidth - dx
    let dy = Math.abs(posBeforeRecon.y - localShip.pos.y)
    if (dy > world.arenaHeight / 2) dy = world.arenaHeight - dy
    const errorDistance = Math.hypot(dx, dy)

    this.lastCorrectionMagnitude = Number(errorDistance.toFixed(2))
    if (errorDistance > this.maxCorrectionMagnitude) {
      this.maxCorrectionMagnitude = Number(errorDistance.toFixed(2))
    }
    this.totalReconciliations++

    // 4. Плавне згладжування візуального зсуву (Smoothing)
    if (this.smoothingEnabled && errorDistance > 0.5 && errorDistance < 300) {
      // Зберігаємо різницю, щоб око не бачило миттєвого стрибка
      let ox = posBeforeRecon.x - localShip.pos.x
      if (ox > world.arenaWidth / 2) ox -= world.arenaWidth
      else if (ox < -world.arenaWidth / 2) ox += world.arenaWidth

      let oy = posBeforeRecon.y - localShip.pos.y
      if (oy > world.arenaHeight / 2) oy -= world.arenaHeight
      else if (oy < -world.arenaHeight / 2) oy += world.arenaHeight

      const offset = new Vector2(ox, oy)
      this.visualOffset = this.visualOffset.add(offset)

      // Обмежуємо максимальний візуальний зсув для уникнення надмірного розмиття
      const maxOffset = 60
      if (this.visualOffset.length() > maxOffset) {
        this.visualOffset = this.visualOffset.normalize().scale(maxOffset)
      }
    }
  }

  /**
   * Оновлення візуального згладжування в кожному кадрі
   * @param {number} dt
   */
  updateSmoothing(dt) {
    if (this.visualOffset.lengthSq() > 0.01) {
      const decay = Math.exp(-this.smoothingDecayRate * dt)
      this.visualOffset = this.visualOffset.scale(decay)
    } else {
      this.visualOffset = Vector2.zero()
    }
  }

  /**
   * Отримання згладженої візуальної позиції для рендерингу
   * @param {import('shared').Ship} ship
   * @returns {Vector2}
   */
  getRenderPosition(ship) {
    if (!ship) return Vector2.zero()
    if (!this.smoothingEnabled) return ship.pos
    return ship.pos.add(this.visualOffset)
  }

  /**
   * Ін'єкція штучного розсинхрону (демонстрація корекції для захисту лаби)
   */
  injectDesync(amount = 75) {
    this.injectedDrift = amount
  }
}
