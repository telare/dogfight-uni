import { afterEach, it, expect, vi } from 'vitest'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { Ship, World, Vector2, decodeSnapshot, asSeq } from 'shared'
import { TokenBucket, attachWebSocketServer } from '../src/ws.ts'
import { config } from '../src/config.ts'
import { Bot } from '../src/bot.ts'
import { Match } from '../src/match.ts'

afterEach(() => {
  vi.useRealTimers()
})
it('binary fan-out keeps personalized acknowledgements in independent retained buffers', () => {
  const retained = []
  const players = new Map(
    ['a', 'b'].map((id) => [
      id,
      { socket: { readyState: 1, send: (buffer) => retained.push(buffer) } },
    ]),
  )
  const match = new Match({ room: { players }, seed: 42 })
  for (const id of players.keys()) match.addPlayer({ id, name: id })
  match.lastProcessedSeq.set('a', asSeq(12))
  match.lastProcessedSeq.set('b', asSeq(29))
  match.broadcastSnapshots()
  expect(retained[0]).not.toBe(retained[1])
  expect(retained.map((buffer) => decodeSnapshot(buffer).ackSeq)).toEqual([
    12, 29,
  ])
  expect(decodeSnapshot(retained[0]).entities).toEqual(
    decodeSnapshot(retained[1]).entities,
  )
})
it('token bucket refills at its rate and caps idle credit', () => {
  vi.useFakeTimers()
  const b = new TokenBucket(2, 2)
  expect(b.consume()).toBe(true)
  expect(b.consume()).toBe(true)
  expect(b.consume()).toBe(false)
  vi.advanceTimersByTime(500)
  expect(b.consume()).toBe(true)
  expect(b.consume()).toBe(false)
  vi.advanceTimersByTime(10000)
  expect(b.consume()).toBe(true)
  expect(b.consume()).toBe(true)
  expect(b.consume()).toBe(false)
})
it('heartbeat pings, accepts pong, terminates silent sockets and clears timer', () => {
  vi.useFakeTimers()
  const wss = attachWebSocketServer(http.createServer(), {
    roomManager: {},
    config: { ...config, HEARTBEAT_INTERVAL_MS: 100 },
  })
  const socket = Object.assign(new EventEmitter(), {
    ping: vi.fn(),
    terminate: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  })
  wss.clients.add(socket)
  wss.emit('connection', socket)
  vi.advanceTimersByTime(100)
  expect(socket.ping).toHaveBeenCalledTimes(1)
  socket.emit('pong')
  vi.advanceTimersByTime(100)
  expect(socket.ping).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(100)
  expect(socket.terminate).toHaveBeenCalledTimes(1)
  socket.emit('close')
  wss.clients.clear()
  wss.emit('close')
  expect(vi.getTimerCount()).toBe(0)
})
it('bots chase, fire when aligned, and evade nearby ships', () => {
  const w = new World(),
    s = w.spawn(new Ship({ pos: new Vector2(100, 100), angle: 0 }))
  const target = w.spawn(new Ship({ pos: new Vector2(400, 100) }))
  const b = new Bot().update(s, w)
  expect(b.fire).toBe(true)
  expect(b.turn).toBe(0)
  expect(b.thrust).toBe(1)
  target.pos = new Vector2(120, 100)
  b.update(s, w)
  expect(b.turn).toBe(1)
  expect(b.thrust).toBe(0.3)
})
it('bot insertion validates counts atomically and uses normal match input', () => {
  const m = new Match({ seed: 42 })
  expect(() => m.addBots(0)).toThrow(RangeError)
  expect(() => m.addBots(1.5)).toThrow(RangeError)
  expect(m.addBots(8)).toBe(8)
  expect(() => m.addBots(121)).toThrow(RangeError)
  expect(m.bots.size).toBe(8)
  m.tick()
  expect(m.getStats().playersCount).toBe(8)
  const id = m.bots.keys().next().value
  m.removePlayer(id)
  expect(m.addBots(1)).toBe(8)
  expect(m.playerShips.size).toBe(8)
})
