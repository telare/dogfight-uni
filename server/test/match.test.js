/**
 * Lab 05 — Тести авторитетного матчу (Match), таймера 30 Hz та Latency Injector
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/match.ts'
import { LatencyInjector } from '../src/latency.ts'

describe('Lab 05: Авторитетний матч та мережеві компоненти (server/match)', () => {
  it('1. LatencyInjector коректно додає штучну затримку та симулює втрату пакетів', async () => {
    const injector = new LatencyInjector({
      latencyMs: 40,
      jitterMs: 0,
      dropRate: 0,
    })

    const start = performance.now()
    let delivered = false

    const queued = injector.deliver(() => {
      delivered = true
    })

    assert.equal(queued, true)
    assert.equal(delivered, false)

    await new Promise((resolve) => setTimeout(resolve, 35))
    assert.equal(delivered, true)
    const elapsed = performance.now() - start
    assert.ok(elapsed >= 18, `Затримка в один бік має бути ~20мс (фактично: ${elapsed.toFixed(1)}мс)`)

    // Тест втрати пакетів
    const dropInjector = new LatencyInjector({ dropRate: 1.0 })
    let dropDelivered = false
    const dropQueued = dropInjector.deliver(() => {
      dropDelivered = true
    })
    assert.equal(dropQueued, false)
    assert.equal(dropDelivered, false)
    assert.equal(dropInjector.droppedPacketsCount, 1)
  })

  it('2. Match виконує кроки симуляції на 30 Hz з точним таймером та збирає статистику', async () => {
    const mockRoom = { players: new Map() }
    const match = new Match({
      room: mockRoom,
      tickRate: 30,
    })

    assert.equal(match.tickRate, 30)
    assert.equal(match.tickDt, 1 / 30)
    assert.equal(match.world.size, 4) // 4 початкові астероїди

    const p1 = { id: 'pilot-test-1', name: 'Maverick' }
    const ship = match.addPlayer(p1)
    assert.ok(ship)
    assert.equal(match.playerShips.size, 1)

    // Черга вводу
    match.queueInput(p1.id, { seq: 10, thrust: 1, turn: 0.5, fire: true })
    assert.equal(match.lastProcessedSeq.get(p1.id), 10)

    // Запуск матчу на ~160 мс (~4-5 тіків)
    match.start()
    await new Promise((resolve) => setTimeout(resolve, 160))
    match.stop()

    assert.ok(match.tickNumber >= 3, `Має виконатися щонайменше 3 тіки (виконано: ${match.tickNumber})`)

    const stats = match.getStats()
    assert.equal(stats.tickRate, 30)
    assert.equal(typeof stats.avgDurationMs, 'number')
    assert.equal(typeof stats.avgJitterMs, 'number')
    assert.equal(stats.playersCount, 1)

    match.removePlayer(p1.id)
    assert.equal(match.playerShips.size, 0)
  })
})
