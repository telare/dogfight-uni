import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import {
  parseClientMessage,
  parseServerMessage,
  parseServerConfig,
  ClientMessageSchema,
  SnapshotSchema,
  encodeInput,
  decodeInput,
  encodePing,
  decodePing,
  encodePong,
  decodePong,
  encodeConfig,
  decodeConfig,
  encodeSnapshot,
  decodeSnapshot,
  binaryCodec,
  jsonCodec,
  asEntityId,
  asTick,
  asSeq,
  World,
  Ship,
  Bullet,
  Vector2,
} from 'shared'
import { Bus } from '../../client/src/net/bus.ts'
import { server, roomManager, wss } from '../src/index.ts'

const snapshot = () =>
  SnapshotSchema.parse({
    tick: 1,
    serverTime: 123,
    ackSeq: 0,
    entities: [
      {
        id: 1,
        kind: 'ship',
        x: 10,
        y: 20,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: 100,
        shield: 0,
      },
    ],
  })

describe('Lab 06: checked boundaries and runtime regression', () => {
  it('reuses vacant wire IDs after 65,535 lifetime spawns without replacing a ship', () => {
    const world = new World()
    const ship = world.spawn(new Ship())
    let wrapped = false
    let previous = ship.id
    for (let i = 0; i < 65540; i++) {
      const bullet = world.spawn(new Bullet({ ownerId: ship.id }))
      if (bullet.id < previous) wrapped = true
      assert.notEqual(bullet.id, ship.id)
      assert.equal(world.get(ship.id), ship)
      previous = bullet.id
      world.clear()
      world.spawn(ship)
    }
    assert.equal(wrapped, true)
    assert.doesNotThrow(() =>
      decodeSnapshot(encodeSnapshot(world.getSnapshot())),
    )
  })

  it('skips explicit and restored entity IDs and rejects duplicate live IDs', () => {
    const world = new World()
    const original = world.spawn(new Ship({ id: 1 }))
    assert.equal(world.spawn(new Bullet()).id, 2)
    assert.throws(() => world.spawn(new Ship({ id: 1 })), /already in use/)
    assert.equal(world.get(asEntityId(1)), original)
    world.loadSnapshot({ entities: [original.serialize()] })
    assert.notEqual(world.spawn(new Bullet()).id, original.id)
  })

  it('delivers typed simulation events and unsubscribes listeners', () => {
    const world = new World()
    let count = 0
    const off = world.on('respawn', ({ shipId, pos }) => {
      assert.equal(shipId, 1)
      assert.equal(pos.x, 10)
      count++
    })
    world.dispatchEvent({
      type: 'respawn',
      detail: { shipId: asEntityId(1), pos: new Vector2(10, 20) },
    })
    off()
    world.emit('respawn', { shipId: asEntityId(1), pos: new Vector2(10, 20) })
    assert.equal(count, 1)
    assert.equal(world.events.length, 2)
  })

  it('rejects impossible wire angles while accepting rounded endpoints', () => {
    const view = new DataView(encodeSnapshot(snapshot()))
    for (const angle of [-32768, -3143, 3143, 32767]) {
      view.setInt16(36, angle, true)
      assert.throws(() => decodeSnapshot(view), /angle/)
    }
    for (const angle of [-3142, 3142]) {
      view.setInt16(36, angle, true)
      assert.equal(decodeSnapshot(view).entities[0].angle, angle / 1000)
    }
  })
  it('parses every client variant and rejects malformed input without throwing', () => {
    for (const message of [
      { type: 'join', room: 'room-alpha' },
      { type: 'leave' },
      { type: 'input', seq: 1, tick: 0, turn: -1, thrust: 1, fire: true },
      { type: 'chat', text: 'Hello' },
      { type: 'ping', clientTime: 1 },
      { type: 'config', codec: 'json' },
    ]) {
      assert.equal(parseClientMessage(JSON.stringify(message)).success, true)
    }
    for (const data of [
      '{',
      'null',
      '[]',
      '{"type":"unknown"}',
      JSON.stringify({ type: 'input', turn: 1e9 }),
      JSON.stringify({ type: 'input', seq: -1 }),
      JSON.stringify({ type: 'chat', text: 123 }),
      123,
      null,
    ]) {
      assert.equal(parseClientMessage(data).success, false)
    }
    assert.equal(parseClientMessage('é'.repeat(20), 20).code, 1009)
  })

  it('validates server messages and snapshot entity variants', () => {
    assert.equal(
      parseServerMessage({ type: 'pong', clientTime: 1, serverTime: 2 })
        .success,
      true,
    )
    assert.equal(
      parseServerMessage({ type: 'welcome', shipId: 'wrong' }).success,
      false,
    )
    assert.equal(
      parseServerMessage({
        ...snapshot(),
        entities: [{ ...snapshot().entities[0], kind: 'alien' }],
      }).success,
      false,
    )
    assert.equal(
      parseServerMessage({
        ...snapshot(),
        entities: [{ ...snapshot().entities[0], x: Infinity }],
      }).success,
      false,
    )
    assert.equal(parseServerMessage({ type: 'input', seq: 1 }).success, false)
  })

  it('validates env and branded constructors at runtime', () => {
    assert.equal(parseServerConfig({}).PORT, 3000)
    assert.equal(parseServerConfig({ PORT: '4321' }).PORT, 4321)
    assert.throws(() => parseServerConfig({ PORT: 'invalid' }))
    assert.throws(() => asEntityId(0))
    assert.throws(() => asTick(-1))
    assert.throws(() => asSeq(0x100000000))
  })

  it('checks length, type and version in each standalone binary decoder', () => {
    for (const [encode, decode] of [
      [() => encodeInput({ seq: 1 }), decodeInput],
      [() => encodePing(123), decodePing],
      [() => encodePong(123, 456), decodePong],
      [() => encodeConfig({}), decodeConfig],
      [() => encodeSnapshot(snapshot()), decodeSnapshot],
    ]) {
      const bytes = new Uint8Array(encode())
      assert.doesNotThrow(() => decode(bytes))
      assert.throws(() => decode(bytes.slice(0, -1)))
      const version = bytes.slice()
      version[1] = 99
      assert.throws(() => decode(version))
      const type = bytes.slice()
      type[0] = 99
      assert.throws(() => decode(type))
      const extra = new Uint8Array(bytes.length + 1)
      extra.set(bytes)
      assert.throws(() => decode(extra))
    }
  })

  it('rejects invalid binary ranges, flags, kind IDs and non-finite coordinates', () => {
    const input = new DataView(encodeInput({}))
    input.setInt16(11, 2000, true)
    assert.throws(() => decodeInput(input))
    input.setInt16(11, 0, true)
    input.setUint8(10, 255)
    assert.throws(() => decodeInput(input))
    const config = new DataView(encodeConfig({}))
    config.setUint8(6, 9)
    assert.throws(() => decodeConfig(config))
    const snap = new DataView(encodeSnapshot(snapshot()))
    snap.setUint8(18, 99)
    assert.throws(() => decodeSnapshot(snap))
    snap.setUint8(18, 1)
    snap.setFloat32(20, NaN, true)
    assert.throws(() => decodeSnapshot(snap))
    const ping = new DataView(encodePing(1))
    ping.setFloat64(2, Infinity, true)
    assert.throws(() => decodePing(ping))
  })

  it('round-trips both Codec implementations through validated snapshots', () => {
    for (const codec of [binaryCodec, jsonCodec]) {
      const decoded = codec.decode(codec.encode(snapshot()))
      assert.equal(decoded.type, 'snapshot')
      assert.equal(decoded.entities[0].kind, 'ship')
      assert.equal(decoded.entities[0].x, 10)
      assert.equal(decoded.entities[0].alive, true)
    }
    assert.throws(() =>
      jsonCodec.decode(new TextEncoder().encode('{"type":"snapshot"}')),
    )
  })

  it('unsubscribes typed bus listeners and clears subscriptions', () => {
    const bus = new Bus()
    let calls = 0
    const off = bus.on('status', () => calls++)
    bus.emit('status', { status: 'connected' })
    off()
    bus.emit('status', { status: 'connected' })
    assert.equal(calls, 1)
    bus.on('status', () => calls++)
    bus.clear()
    bus.emit('status', { status: 'connected' })
    assert.equal(calls, 1)
  })

  it('creates readonly parsed snapshots without freezing the live simulation', () => {
    const world = new World({ seed: 42 })
    const ship = new Ship({ pos: new Vector2(10, 20) })
    world.spawn(ship)
    const parsed = SnapshotSchema.parse(world.getSnapshot())
    assert.equal(Object.isFrozen(parsed), true)
    assert.equal(Object.isFrozen(parsed.entities), true)
    assert.equal(Object.isFrozen(parsed.entities[0]), true)
    ship.pos = new Vector2(30, 40)
    assert.equal(parsed.entities[0].x, 10)
    assert.equal(
      ClientMessageSchema.safeParse({ type: 'input', turn: Infinity }).success,
      false,
    )
  })
})

function waitMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Message timeout'))
    }, 3000)
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('message', onMessage)
    }
    const onMessage = (data, isBinary) => {
      try {
        if (predicate(data, isBinary)) {
          cleanup()
          resolve(data)
        }
      } catch (error) {
        cleanup()
        reject(error)
      }
    }
    socket.on('message', onMessage)
  })
}

describe('Lab 06: real WebSocket boundaries', () => {
  let url
  before(async () => {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    url = `ws://127.0.0.1:${server.address().port}/ws`
  })
  after(async () => {
    for (const socket of wss.clients) socket.terminate()
    await new Promise((resolve) => wss.close(resolve))
    await new Promise((resolve) => server.close(resolve))
    await roomManager.closeAll()
  })
  for (const binary of [false, true]) {
    for (const type of ['input', 'ping', 'config']) {
      it(`limits ${binary ? 'binary' : 'JSON'} ${type} floods`, async () => {
        const socket = new WebSocket(url)
        try {
          await once(socket, 'open')
          const closed = once(socket, 'close', {
            signal: AbortSignal.timeout(3000),
          })
          const message =
            type === 'input'
              ? encodeInput({ seq: 1 })
              : type === 'ping'
                ? encodePing(1)
                : encodeConfig({})
          const payload = binary ? message : JSON.stringify({ type })
          for (let i = 0; i < 256; i++) socket.send(payload, { binary })
          assert.equal((await closed)[0], 1008)
        } finally {
          socket.terminate()
        }
      })
    }
    it(`allows a normal input burst alongside ${binary ? 'binary' : 'JSON'} control traffic`, async () => {
      const socket = new WebSocket(url)
      try {
        await once(socket, 'open')
        const pong = waitMessage(socket, (data, isBinary) =>
          binary
            ? isBinary && data[0] === 4
            : !isBinary && JSON.parse(data.toString()).type === 'pong',
        )
        for (let i = 1; i <= 60; i++)
          socket.send(
            binary
              ? encodeInput({ seq: i })
              : JSON.stringify({ type: 'input', seq: i }),
            { binary },
          )
        socket.send(
          binary
            ? encodePing(1)
            : JSON.stringify({ type: 'ping', clientTime: 1 }),
          { binary },
        )
        await pong
        assert.equal(socket.readyState, WebSocket.OPEN)
      } finally {
        socket.terminate()
      }
    })
  }
  it('sends JSON snapshots as text and can switch back to binary', async () => {
    const socket = new WebSocket(url)
    try {
      await once(socket, 'open')
      const welcome = waitMessage(
        socket,
        (data, binary) =>
          !binary && JSON.parse(data.toString()).type === 'welcome',
      )
      socket.send(
        JSON.stringify({ type: 'join', room: 'room-alpha', name: 'Lab06' }),
      )
      assert.equal(
        parseServerMessage(JSON.parse((await welcome).toString())).success,
        true,
      )
      const json = waitMessage(
        socket,
        (data, binary) =>
          !binary && JSON.parse(data.toString()).type === 'snapshot',
      )
      socket.send(JSON.stringify({ type: 'config', codec: 'json' }))
      assert.equal(
        parseServerMessage(JSON.parse((await json).toString())).success,
        true,
      )
      const binary = waitMessage(
        socket,
        (data, isBinary) => isBinary && data[0] === 2,
      )
      socket.send(JSON.stringify({ type: 'config', codec: 'binary' }))
      assert.equal(decodeSnapshot(await binary).type, 'snapshot')
    } finally {
      socket.terminate()
    }
  })
  for (const [name, payload, binary] of [
    ['out-of-range JSON', JSON.stringify({ type: 'input', turn: 1e9 }), false],
    ['unknown client message', JSON.stringify({ type: 'snapshot' }), false],
    [
      'wrong binary version',
      new Uint8Array([3, 99, 0, 0, 0, 0, 0, 0, 0, 0]),
      true,
    ],
    [
      'server-only binary message',
      new Uint8Array(encodeSnapshot(snapshot())),
      true,
    ],
  ])
    it(`closes ${name} with protocol error`, async () => {
      const socket = new WebSocket(url)
      try {
        await once(socket, 'open')
        const closed = once(socket, 'close', {
          signal: AbortSignal.timeout(3000),
        })
        socket.send(payload, { binary })
        assert.equal((await closed)[0], 1002)
      } finally {
        socket.terminate()
      }
    })
})
