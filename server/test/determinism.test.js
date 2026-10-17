/**
 * Lab 05 — Тести детермінізму та імпорту shared симуляції (node:test)
 *
 * Перевіряє:
 * 1. Чистий імпорт shared пакету в середовищі Node без DOM, window, Canvas.
 * 2. Детермінізм Mulberry32 PRNG (однаковий seed -> однакові псевдовипадкові числа).
 * 3. 1000 кроків симуляції двох незалежних світів з однаковим seed та input
 *    призводять до побітово ідентичного кінцевого стану.
 * 4. Штучне порушення детермінізму (Math.random) обов'язково фіксується розходженням хешів.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  World,
  Ship,
  PRNG,
  mulberry32,
  Vector2,
} from 'shared'

function hashWorldState(world) {
  const serialized = world.getSnapshot(1000, 0, 0)
  const json = JSON.stringify(serialized)
  return crypto.createHash('sha256').update(json).digest('hex')
}

describe('Lab 05: Чиста симуляція та Детермінізм (shared/sim)', () => {
  it('успішно імпортується та інстанціюється в Node.js без наявності DOM чи Canvas', () => {
    assert.equal(typeof window, 'undefined')
    assert.equal(typeof document, 'undefined')

    const world = new World({ width: 1200, height: 800, seed: 12345 })
    assert.equal(world.arenaWidth, 1200)
    assert.equal(world.arenaHeight, 800)
    assert.equal(world.size, 0)
  })

  it('Mulberry32 PRNG детермінований для однакового seed', () => {
    const rngA = mulberry32(987654321)
    const rngB = mulberry32(987654321)

    const seqA = Array.from({ length: 100 }, () => rngA())
    const seqB = Array.from({ length: 100 }, () => rngB())

    assert.deepEqual(seqA, seqB)

    const prng1 = new PRNG(42)
    const prng2 = new PRNG(42)
    for (let i = 0; i < 50; i++) {
      assert.equal(prng1.random(), prng2.random())
      assert.equal(prng1.range(10, 100), prng2.range(10, 100))
      assert.equal(prng1.randInt(0, 10), prng2.randInt(0, 10))
    }
  })

  it('1000 кроків симуляції дають 100% однаковий хеш стану на двох незалежних світах', () => {
    const SEED = 20261011
    const worldA = new World({ width: 1000, height: 1000, seed: SEED })
    const worldB = new World({ width: 1000, height: 1000, seed: SEED })

    worldA.spawnInitialAsteroids(4)
    worldB.spawnInitialAsteroids(4)

    const shipA = new Ship({
      id: 100,
      pos: new Vector2(500, 500),
      playerId: 'pilot-1',
    })
    const shipB = new Ship({
      id: 100,
      pos: new Vector2(500, 500),
      playerId: 'pilot-1',
    })

    worldA.spawn(shipA)
    worldB.spawn(shipB)

    const scriptedInputs = Array.from({ length: 1000 }, (_, i) => ({
      thrust: i % 3 === 0 ? 1 : 0,
      turn: Math.sin(i * 0.05),
      fire: i % 10 === 0,
      seq: i + 1,
    }))

    const dt = 1 / 30
    for (let i = 0; i < 1000; i++) {
      const input = scriptedInputs[i]
      worldA.step(dt, new Map([[100, input]]))
      worldB.step(dt, new Map([[100, input]]))
    }

    const hashA = hashWorldState(worldA)
    const hashB = hashWorldState(worldB)

    assert.equal(hashA, hashB, 'Хеші стану після 1000 кроків мають бути побітово ідентичними!')
    assert.equal(shipA.pos.x, shipB.pos.x)
    assert.equal(shipA.pos.y, shipB.pos.y)
    assert.equal(shipA.angle, shipB.angle)
    assert.equal(shipA.hp, shipB.hp)
    assert.equal(shipA.score, shipB.score)
  })

  it('порушення детермінізму (Math.random у симуляції) викликає розходження хешів', () => {
    const SEED = 777
    const worldClean = new World({ width: 1000, height: 1000, seed: SEED })
    const worldDirty = new World({ width: 1000, height: 1000, seed: SEED })

    worldClean.spawnInitialAsteroids(4)
    worldDirty.spawnInitialAsteroids(4)

    const shipClean = new Ship({ id: 10, pos: new Vector2(500, 500) })
    const shipDirty = new Ship({ id: 10, pos: new Vector2(500, 500) })

    worldClean.spawn(shipClean)
    worldDirty.spawn(shipDirty)

    const dt = 1 / 30
    for (let i = 0; i < 100; i++) {
      worldClean.step(dt, new Map([[10, { thrust: 1, turn: 0.1, fire: false }]]))

      // Штучний недетермінований дрейф
      const dirtyTurn = 0.1 + (i === 50 ? Math.random() * 0.05 + 0.01 : 0)
      worldDirty.step(dt, new Map([[10, { thrust: 1, turn: dirtyTurn, fire: false }]]))
    }

    const hashClean = hashWorldState(worldClean)
    const hashDirty = hashWorldState(worldDirty)

    assert.notEqual(hashClean, hashDirty, 'Недетерміноване відхилення має спричинити різницю хешів!')
  })
})
