/**
 * Lab 05 — Тести бінарного кодека DataView та порівняння з JSON (M4)
 *
 * Перевіряє:
 * 1. Endianness: Little-Endian порядок байтів у DataView.
 * 2. Кругові тести (round-trip) для Input та Snapshot повідомлень:
 *    decode(encode(msg)) глибоко дорівнює msg у межах допуску квантування.
 * 3. Квантування кута (Int16) з похибкою не більше 0.001 рад (0.057°).
 * 4. Порівняння розміру буфера: бінарний фрейм суттєво менший за JSON (~80-90%).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
  encodePing,
  decodePing,
  encodePong,
  decodePong,
  encodeConfig,
  decodeConfig,
  encodeJsonSnapshot,
  decodeJsonSnapshot,
  BINARY_SPEC,
} from 'shared'

describe('Lab 05: Бінарний протокол та DataView Кодек (shared/codec)', () => {
  it('1. Endianness: Little-Endian порядок байтів у DataView', () => {
    const buf = new ArrayBuffer(4)
    const view = new DataView(buf)

    // Запис 0x12345678 у Little-Endian
    view.setUint32(0, 0x12345678, true)
    const u8 = new Uint8Array(buf)

    // Молодший байт (0x78) має бути першим за індексом 0
    assert.equal(u8[0], 0x78)
    assert.equal(u8[1], 0x56)
    assert.equal(u8[2], 0x34)
    assert.equal(u8[3], 0x12)

    // Запис у Big-Endian для порівняння
    view.setUint32(0, 0x12345678, false)
    assert.equal(u8[0], 0x12)
    assert.equal(u8[1], 0x34)
    assert.equal(u8[2], 0x56)
    assert.equal(u8[3], 0x78)
  })

  it('2. Input Frame Round-Trip: точність декодування та збереження прапорців', () => {
    const original = {
      type: 'input',
      seq: 1337,
      tick: 450,
      thrust: 1,
      turn: -0.75,
      fire: true,
    }

    const encoded = encodeInput(original)
    assert.equal(encoded.byteLength, BINARY_SPEC.INPUT_SIZE)

    const decoded = decodeInput(encoded)
    assert.equal(decoded.type, 'input')
    assert.equal(decoded.seq, 1337)
    assert.equal(decoded.tick, 450)
    assert.equal(decoded.thrust, 1)
    assert.equal(decoded.fire, true)
    assert.ok(
      Math.abs(decoded.turn - original.turn) < 0.002,
      `Похибка квантування turn: ${Math.abs(decoded.turn - original.turn)}`,
    )
  })

  it('3. Snapshot Frame Round-Trip: збереження координат, швидкостей та квантованого кута', () => {
    const original = {
      type: 'snapshot',
      tick: 999,
      serverTime: 12345678,
      ackSeq: 88,
      entities: [
        {
          id: 1,
          kind: 'ship',
          x: 450.25,
          y: 720.5,
          vx: 120.125,
          vy: -85.75,
          angle: 2.145,
          hp: 85,
          shield: 40,
          thrust: 1,
        },
        {
          id: 2,
          kind: 'asteroid',
          x: 100.0,
          y: 200.0,
          vx: 10.5,
          vy: 20.5,
          angle: 0.5,
          tier: 2,
          hp: 60,
          shield: 0,
        },
        {
          id: 3,
          kind: 'bullet',
          x: 460.0,
          y: 730.0,
          vx: 500.0,
          vy: 200.0,
          angle: 1.1,
          isHoming: true,
          hp: 1,
          shield: 0,
        },
        {
          id: 4,
          kind: 'pickup',
          x: 300.0,
          y: 400.0,
          vx: 0,
          vy: 0,
          angle: 0,
          type: 'shield',
          hp: 0,
          shield: 0,
        },
      ],
    }

    const encoded = encodeSnapshot(original)
    const expectedLength =
      BINARY_SPEC.SNAPSHOT_HEADER_SIZE + 4 * BINARY_SPEC.ENTITY_RECORD_SIZE
    assert.equal(encoded.byteLength, expectedLength)

    const decoded = decodeSnapshot(encoded)
    assert.equal(decoded.type, 'snapshot')
    assert.equal(decoded.tick, original.tick)
    assert.equal(decoded.serverTime, original.serverTime)
    assert.equal(decoded.ackSeq, original.ackSeq)
    assert.equal(decoded.entities.length, 4)

    // Перевірка сутності корабля
    const ship = decoded.entities[0]
    assert.equal(ship.id, 1)
    assert.equal(ship.kind, 'ship')
    assert.ok(Math.abs(ship.x - 450.25) < 0.01)
    assert.ok(Math.abs(ship.y - 720.5) < 0.01)
    assert.ok(Math.abs(ship.vx - 120.125) < 0.01)
    assert.ok(Math.abs(ship.vy - (-85.75)) < 0.01)
    assert.ok(
      Math.abs(ship.angle - 2.145) < 0.002,
      `Квантування кута ship: ${Math.abs(ship.angle - 2.145)}`,
    )
    assert.equal(ship.hp, 85)
    assert.equal(ship.shield, 40)
    assert.equal(ship.thrust, 1)

    // Перевірка астероїда
    const ast = decoded.entities[1]
    assert.equal(ast.id, 2)
    assert.equal(ast.kind, 'asteroid')
    assert.equal(ast.tier, 2)

    // Перевірка кулі
    const bullet = decoded.entities[2]
    assert.equal(bullet.id, 3)
    assert.equal(bullet.kind, 'bullet')
    assert.equal(bullet.isHoming, true)

    // Перевірка бонусу
    const pickup = decoded.entities[3]
    assert.equal(pickup.id, 4)
    assert.equal(pickup.kind, 'pickup')
    assert.equal(pickup.type, 'shield')
  })

  it('4. Ping, Pong та Config Round-Trip', () => {
    const pingBuf = encodePing(123456.789)
    const ping = decodePing(pingBuf)
    assert.equal(ping.clientTime, 123456.789)

    const pongBuf = encodePong(123456.789, 987654.321)
    const pong = decodePong(pongBuf)
    assert.equal(pong.clientTime, 123456.789)
    assert.equal(pong.serverTime, 987654.321)

    const cfg = { latencyMs: 150, jitterMs: 25, dropRate: 0.05, codec: 'binary' }
    const cfgBuf = encodeConfig(cfg)
    const decodedCfg = decodeConfig(cfgBuf)
    assert.equal(decodedCfg.latencyMs, 150)
    assert.equal(decodedCfg.jitterMs, 25)
    assert.ok(Math.abs(decodedCfg.dropRate - 0.05) < 0.01)
    assert.equal(decodedCfg.codec, 'binary')
  })

  it('5. JSON vs Binary: бінарний знімок значно компактніший за JSON', () => {
    const sampleEntities = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      kind: 'ship',
      x: 100.5 + i * 50,
      y: 200.25 + i * 40,
      vx: 45.5,
      vy: -30.2,
      angle: 1.23,
      hp: 100,
      shield: 50,
      thrust: 1,
    }))

    const snap = {
      tick: 300,
      serverTime: Date.now(),
      ackSeq: 50,
      entities: sampleEntities,
    }

    const binaryBuf = encodeSnapshot(snap)
    const jsonBuf = encodeJsonSnapshot(snap)

    const binaryBytes = binaryBuf.byteLength
    const jsonBytes = jsonBuf.byteLength

    console.log(`[Codec Benchmark] 8 ships: Binary = ${binaryBytes} B vs JSON = ${jsonBytes} B (Ratio: ${(jsonBytes / binaryBytes).toFixed(2)}x)`)

    assert.ok(
      binaryBytes < jsonBytes * 0.35,
      `Бінарний розмір (${binaryBytes}B) має бути менше 35% від JSON (${jsonBytes}B)`,
    )

    const decodedJson = decodeJsonSnapshot(jsonBuf)
    assert.equal(decodedJson.entities.length, 8)
  })
})
