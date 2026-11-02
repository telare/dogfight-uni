import { afterEach, it, expect, vi } from 'vitest'
import { Ship, Vector2, DRAG } from 'shared'
import { reconcileState } from '../src/net/reconcile.ts'
import { createLoop } from '../src/loop.ts'
import { InterpolationManager } from '../src/net/interpolation.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('interpolation reuses render objects, crosses seams and releases departed entities', () => {
  const manager = new InterpolationManager({
    interpolationDelayMs: 0,
    arenaWidth: 1200,
    arenaHeight: 800,
  })
  const ship = new Ship({ id: 10, pos: new Vector2(1190, 100) }).serialize()
  manager.buffer = [
    { arrivalTime: 100, snapshot: { entities: [ship] } },
    { arrivalTime: 200, snapshot: { entities: [{ ...ship, x: 10 }] } },
  ]
  const first = manager.getInterpolatedEntities(null, 150)[0]
  expect(first.x).toBe(0)
  const next = manager.getInterpolatedEntities(null, 175)[0]
  expect(next).toBe(first)
  expect(next.pos.x).toBe(5)
  manager.buffer[1].snapshot.entities = []
  expect(manager.getInterpolatedEntities(null, 175)).toHaveLength(0)
  manager.buffer[1].snapshot.entities = [ship]
  expect(manager.getInterpolatedEntities(null, 175)[0]).not.toBe(first)
  manager.reset()
  expect(manager.getInterpolatedEntities()).toHaveLength(0)
})

it('reconciliation drops acknowledged commands and replays from server position', () => {
  const server = new Ship({
    pos: new Vector2(100, 200),
    vel: new Vector2(10, 0),
    angle: 0,
  }).serialize()
  const commands = [
    { seq: 1, input: { thrust: 1 }, dt: 1 },
    { seq: 2, input: {}, dt: 0.1 },
  ]
  const copy = structuredClone({ server, commands })
  const result = reconcileState(server, commands, 1, 1200, 800)
  expect(result.vel.x).toBeCloseTo(10 * Math.exp(-DRAG * 0.1), 10)
  expect(result.pos.x).toBeCloseTo(100 + result.vel.x * 0.1, 10)
  expect(result.pos.y).toBe(200)
  expect({ server, commands }).toEqual(copy)
})
it('reconciliation wraps replayed movement across the arena seam', () => {
  const s = new Ship({
    pos: new Vector2(1199, 200),
    vel: new Vector2(100, 0),
    angle: 0,
  }).serialize()
  expect(
    reconcileState(s, [{ seq: 1, input: {}, dt: 0.1 }], 0, 1200, 800).pos.x,
  ).toBeLessThan(10)
})
it('fixed loop accumulates time, clamps long stalls, and stops its timer', () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback) =>
    setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const simulate = vi.fn(),
    render = vi.fn()
  const loop = createLoop({ simulate, render })
  loop.toggleInterval()
  loop.start()
  loop.start()
  vi.advanceTimersByTime(160)
  expect(simulate).toHaveBeenCalledTimes(8)
  expect(simulate).toHaveBeenLastCalledWith(1 / 60)
  expect(render.mock.calls.at(-1)[0]).toBeGreaterThanOrEqual(0)
  expect(render.mock.calls.at(-1)[0]).toBeLessThan(1)
  loop.stop()
  vi.advanceTimersByTime(1000)
  expect(simulate).toHaveBeenCalledTimes(8)
  expect(vi.getTimerCount()).toBe(0)
})
it('animation loop caps catch-up after a one-second stall', () => {
  vi.useFakeTimers()
  let frame
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const simulate = vi.fn()
  const loop = createLoop({ simulate, render: vi.fn() })
  loop.start()
  frame(1)
  frame(1001)
  expect(simulate).toHaveBeenCalledTimes(15)
  loop.stop()
})
