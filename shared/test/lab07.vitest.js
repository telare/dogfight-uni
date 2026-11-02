import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  Vector2,
  integrateShipPhysics,
  DRAG,
  MAX_SPEED,
  World,
  Ship,
  Bullet,
  Asteroid,
  Pickup,
  circlesIntersect,
  resolveCollisions,
  wrap,
  hideWrapForLerp,
  createHoming,
  normalizeAngleDiff,
  createPickupEffect,
  PRNG,
  Bus,
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
  decodeAnyBinary,
  parseClientMessage,
  BINARY_SPEC,
  enableTiming,
  timed,
} from '../src/index.ts'

const input = fc.record({
  seq: fc.nat(0xffffffff),
  tick: fc.nat(0xffffffff),
  thrust: fc.integer({ min: 0, max: 1 }),
  turn: fc.double({ min: -1, max: 1, noNaN: true }),
  fire: fc.boolean(),
})
const options = { numRuns: 1000, seed: 7007 }

describe('Lab 07 properties', () => {
  it('structured malformed frames also raise RangeError, including invalid entity IDs', () => {
    const world = new World()
    world.spawn(new Ship())
    const valid = encodeSnapshot(world.getSnapshot())
    fc.assert(
      fc.property(fc.constantFrom(0, 1, 2, 3, 4), (mutation) => {
        const bytes = valid.slice(0),
          view = new DataView(bytes)
        if (mutation === 0) view.setUint16(16, 0, true)
        if (mutation === 1) view.setUint8(18, 255)
        if (mutation === 2) view.setFloat32(20, NaN, true)
        if (mutation === 3) view.setUint8(19, 255)
        if (mutation === 4) view.setInt16(36, 32767, true)
        expect(() => decodeSnapshot(bytes)).toThrow(RangeError)
      }),
      options,
    )
  })
  it('binary input round trips within turn quantization', () => {
    fc.assert(
      fc.property(input, (m) => {
        const decoded = decodeInput(encodeInput(m))
        expect(decoded).toMatchObject({
          seq: m.seq,
          tick: m.tick,
          thrust: m.thrust,
          fire: m.fire,
        })
        expect(Math.abs(decoded.turn - m.turn)).toBeLessThanOrEqual(0.000501)
      }),
      options,
    )
  })
  it('snapshot length equals the wire specification for every population', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (count) => {
        const world = new World()
        for (let i = 0; i < count; i++) world.spawn(new Ship())
        const bytes = encodeSnapshot(world.getSnapshot())
        expect(bytes.byteLength).toBe(
          BINARY_SPEC.SNAPSHOT_HEADER_SIZE +
            count * BINARY_SPEC.ENTITY_RECORD_SIZE,
        )
        expect(decodeSnapshot(bytes).entities).toHaveLength(count)
      }),
      { ...options, numRuns: 100 },
    )
  })
  it('arbitrary bytes either decode or raise the expected RangeError', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        try {
          decodeAnyBinary(bytes)
        } catch (error) {
          expect(error).toBeInstanceOf(RangeError)
        }
      }),
      options,
    )
  })
  it('ships stay in the arena over 1000 generated input steps', () => {
    fc.assert(
      fc.property(
        fc.array(input, { minLength: 1000, maxLength: 1000 }),
        (commands) => {
          const ship = new Ship()
          for (const command of commands) {
            ship.stepInput(command, 1 / 30)
            wrap(ship, 1200, 800)
            expect(ship.pos.x).toBeGreaterThanOrEqual(0)
            expect(ship.pos.x).toBeLessThan(1200)
            expect(ship.pos.y).toBeGreaterThanOrEqual(0)
            expect(ship.pos.y).toBeLessThan(800)
          }
        },
      ),
      { ...options, numRuns: 20 },
    )
  })
  it('parser accepts generated messages and rejects mutated fields', () => {
    fc.assert(
      fc.property(
        input,
        fc.constantFrom('seq', 'tick', 'thrust', 'turn', 'fire'),
        (command, field) => {
          const m = { type: 'input', ...command }
          expect(parseClientMessage(JSON.stringify(m)).success).toBe(true)
          const invalid = {
            ...m,
            [field]: field === 'fire' ? 1 : field === 'turn' ? 2 : -1,
          }
          expect(parseClientMessage(JSON.stringify(invalid)).success).toBe(
            false,
          )
        },
      ),
      options,
    )
  })
  it('drag never increases kinetic energy', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (x, y) => {
          const vel = new Vector2(x, y)
          const result = integrateShipPhysics(
            { pos: Vector2.zero(), vel, angle: 0 },
            {},
            1 / 30,
          )
          expect(result.vel.lengthSq()).toBeLessThanOrEqual(
            vel.lengthSq() + 1e-8,
          )
        },
      ),
      options,
    )
  })
})

describe('Vectors and integration', () => {
  it.each([
    ['add', [4, 6]],
    ['sub', [-2, -2]],
  ])('%s preserves its operands', (method, expected) => {
    const a = new Vector2(1, 2),
      b = new Vector2(3, 4)
    expect(a[method](b).toJSON()).toEqual({ x: expected[0], y: expected[1] })
    expect(a.toJSON()).toEqual({ x: 1, y: 2 })
  })
  it('normalizes zero without NaN', () =>
    expect(Vector2.zero().normalize().length()).toBe(0))
  it('normalizes a 3-4-5 vector', () =>
    expect(new Vector2(3, 4).normalize().length()).toBe(1))
  it('computes dot and distance', () => {
    expect(new Vector2(3, 4).dot(new Vector2(2, 1))).toBe(10)
    expect(new Vector2(3, 4).dist(Vector2.zero())).toBe(5)
  })
  it('interpolates and clones independently', () => {
    const a = new Vector2(2, 4)
    expect(a.clone()).not.toBe(a)
    expect(Vector2.lerp(Vector2.zero(), a, 0.5)).toEqual(new Vector2(1, 2))
  })
  it('integrates known acceleration and exponential drag', () => {
    const result = integrateShipPhysics(
      { pos: Vector2.zero(), vel: Vector2.zero(), angle: 0 },
      { thrust: 1 },
      0.1,
    )
    expect(result.vel.x).toBeCloseTo(52 * Math.exp(-DRAG * 0.1), 10)
    expect(result.pos.x).toBeCloseTo(result.vel.x * 0.1, 10)
    expect(result.vel.y).toBe(0)
  })
  it('clamps turn and speed', () => {
    const r = integrateShipPhysics(
      { pos: Vector2.zero(), vel: new Vector2(1000, 0), angle: 0 },
      { turn: 5 },
      1,
    )
    expect(r.angle).toBe(3.6)
    expect(r.vel.length()).toBeLessThanOrEqual(MAX_SPEED)
  })
  it('wraps numeric coordinates and adjusts seam interpolation', () => {
    const a = { x: -1, y: 801 },
      b = { x: 1, y: 1 }
    wrap(a, 1200, 800)
    expect(a).toEqual({ x: 1199, y: 1 })
    hideWrapForLerp(a, b, 1200, 800)
    expect(a.x).toBe(-1)
  })
})

describe('Collision and lifecycle cases', () => {
  it.each([
    [20, true],
    [19, true],
    [21, false],
  ])('circle separation %i gives %s', (distance, hit) => {
    expect(
      circlesIntersect(Vector2.zero(), 10, new Vector2(distance, 0), 10),
    ).toBe(hit)
  })
  it('documents discrete collision tunneling at high bullet speed', () => {
    const w = new World()
    const target = w.spawn(new Ship({ pos: new Vector2(300, 300) }))
    const bullet = w.spawn(
      new Bullet({ pos: new Vector2(200, 300), vel: new Vector2(6000, 0) }),
    )
    bullet.update(1 / 30, w)
    resolveCollisions(w)
    expect(bullet.pos.x).toBe(400)
    expect(target.hp).toBe(100)
  })
  it('bullet damage consumes shields then health and rewards a kill', () => {
    const w = new World()
    const shooter = w.spawn(new Ship({ pos: new Vector2(10, 10) }))
    const victim = w.spawn(
      new Ship({ pos: new Vector2(300, 300), hp: 20, shield: 10 }),
    )
    w.spawn(new Bullet({ pos: victim.pos, ownerId: shooter.id }))
    resolveCollisions(w)
    expect(victim.alive).toBe(false)
    expect(victim.shield).toBe(0)
    expect(shooter.score).toBe(250)
  })
  it('ignores owner collisions', () => {
    const w = new World(),
      s = w.spawn(new Ship())
    const b = w.spawn(new Bullet({ pos: s.pos, ownerId: s.id }))
    resolveCollisions(w)
    expect(s.hp).toBe(100)
    expect(b.alive).toBe(true)
  })
  it.each(['shield', 'rapid', 'homing', 'heal'])(
    'collects %s and restores it from a snapshot',
    (type) => {
      const s = new Ship({ hp: 40 }),
        p = new Pickup({ type })
      expect(p.collect(s)).toBeTypeOf('string')
      expect(p.alive).toBe(false)
      expect(Pickup.fromSnapshot(p.serialize()).type).toBe(type)
      expect(createPickupEffect({ type }).apply(null)).toBeNull()
    },
  )
  it('expires pickup and bullet TTLs', () => {
    for (const e of [new Pickup({ ttl: 0.01 }), new Bullet({ ttl: 0.01 })]) {
      e.update(0.02, null)
      expect(e.alive).toBe(false)
    }
  })
  it('splits large asteroids and awards score', () => {
    const w = new World({ seed: 42 })
    const s = w.spawn(new Ship({ pos: new Vector2(900, 600) }))
    const a = w.spawn(new Asteroid({ pos: new Vector2(300, 300), hp: 1 }))
    w.spawn(new Bullet({ pos: a.pos, ownerId: s.id }))
    resolveCollisions(w)
    expect(a.alive).toBe(false)
    expect(s.score).toBe(100)
    expect([...w.ofKind('asteroid')].filter((e) => e.alive)).toHaveLength(2)
  })
  it('homing acquires a target and turns towards it', () => {
    const w = new World()
    w.spawn(new Asteroid({ pos: new Vector2(200, 200) }))
    const b = w.spawn(
      new Bullet({ pos: new Vector2(100, 100), isHoming: true }),
    )
    b.update(0.1, w)
    expect(b.angle).toBeGreaterThan(0)
    const homing = createHoming()
    homing.update(b, 0.1, w)
    expect(b.vel.length()).toBeCloseTo(380)
    expect(normalizeAngleDiff(3 * Math.PI)).toBeCloseTo(Math.PI)
  })
  it('respawns a dead ship after two seconds', () => {
    const w = new World(),
      s = w.spawn(new Ship())
    s.takeDamage(1000)
    for (let i = 0; i < 61; i++) w.step(1 / 30)
    expect(s.alive).toBe(true)
    expect(s.hp).toBe(100)
    expect(s.shield).toBe(40)
  })
  it('expires buffs, heals only live ships, and limits shield', () => {
    const s = new Ship({ hp: 50 })
    s.heal(100)
    s.addShield(200, 0.1)
    s.activateRapidFire(0.1)
    s.activateHomingMissiles(0.1)
    expect(s.hp).toBe(100)
    expect(s.shield).toBe(100)
    s.stepInput({}, 0.2)
    expect(s.shield).toBe(0)
    expect(s.rapidFireTimer).toBeLessThanOrEqual(0)
    s.destroy()
    s.heal(10)
    s.addShield(10)
    expect(s.shield).toBe(0)
  })
  it('event bus unsubscribes and clears', () => {
    const b = new Bus()
    let count = 0
    const off = b.on('x', () => count++)
    b.emit('x', {})
    off()
    b.emit('x', {})
    b.clear()
    b.emit('x', {})
    expect(count).toBe(1)
  })
  it('forked PRNG is reproducible', () => {
    const a = new PRNG(4),
      b = new PRNG(4)
    expect(a.fork().random()).toBe(b.fork().random())
  })
  it('timing preserves return values and clears entries even on exceptions', () => {
    enableTiming()
    expect(timed('test', () => 42)).toBe(42)
    expect(() =>
      timed('test', () => {
        throw new Error('expected')
      }),
    ).toThrow('expected')
    expect(performance.getEntriesByName('test')).toHaveLength(0)
    enableTiming(false)
  })
})
