import { afterAll, expect, it } from 'vitest'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { parseServerConfig, parseServerMessage } from 'shared'
import { connectionIp } from '../src/ws.ts'
import { createApplication, gracefulShutdown as closeSingleton } from '../src/index.ts'
import { config } from '../src/config.ts'

afterAll(() => closeSingleton())

it('fails fast on malformed production configuration and accepts exact origins only', () => {
  for (const env of [
    { ALLOWED_ORIGINS: '*' }, { ALLOWED_ORIGINS: 'https://game.example/path' },
    { ALLOWED_ORIGINS: 'ftp://game.example' }, { MAX_ROOMS: '2' },
    { MAX_CONNECTIONS_PER_IP: '0' }, { MAX_PLAYERS_PER_ROOM: '129' },
    { ENABLE_DIAGNOSTICS: 'yes' }, { TRUSTED_PROXY_IPS: 'private_ranges' },
  ]) expect(() => parseServerConfig(env)).toThrow()
  expect(parseServerConfig({ ALLOWED_ORIGINS: 'https://game.example' }).ALLOWED_ORIGINS).toEqual(['https://game.example'])
  expect(parseServerMessage({ type: 'shutdown', message: 'Restarting' }).success).toBe(true)
})

it('uses forwarded IPs only from an explicitly trusted peer', () => {
  const req = { socket: { remoteAddress: '::ffff:172.30.8.2' }, headers: { 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.1' } }
  expect(connectionIp(req)).toBe('172.30.8.2')
  expect(connectionIp(req, ['172.30.8.2'])).toBe('203.0.113.1')
  req.headers['x-real-ip'] = '203.0.113.1, 198.51.100.1'
  expect(connectionIp(req, ['172.30.8.2'])).toBe('172.30.8.2')
})

it('enforces room, human and bot capacity without overwriting live rooms', async () => {
  const app = createApplication()
  try {
    expect(() => app.roomManager.createRoom({ id: 'room-alpha', name: 'Duplicate' })).toThrow('already exists')
    for (let i = app.roomManager.count; i < config.MAX_ROOMS; i++) app.roomManager.createRoom({ id: `cap-${i}`, name: 'Capacity' })
    expect(() => app.roomManager.createRoom({ name: 'Overflow' })).toThrow('Room limit')
    const room = app.roomManager.getRoom('room-alpha')
    room.match.addBots(config.MAX_PLAYERS_PER_ROOM)
    expect(room.isFull).toBe(true)
    expect(() => room.match.addBots(1)).toThrow()
    expect(() => room.join({ id: 'overflow', name: 'Overflow', socket: {} })).toThrow()
  } finally { await app.gracefulShutdown() }
})

it('readiness drops during an idempotent drain and clients receive shutdown then 1001', async () => {
  const app = createApplication()
  app.server.listen(0, '127.0.0.1')
  await once(app.server, 'listening')
  const base = `http://127.0.0.1:${app.server.address().port}`
  const socket = new WebSocket(base.replace('http', 'ws') + '/ws')
  try {
    await once(socket, 'open')
    const oldPath = config.CLIENT_DIST_DIR
    try {
      config.CLIENT_DIST_DIR = oldPath + '/missing'
      expect((await fetch(base + '/ready')).status).toBe(503)
    } finally { config.CLIENT_DIST_DIR = oldPath }
    const messages = []
    socket.on('message', (data) => messages.push(JSON.parse(data)))
    const closed = once(socket, 'close')
    const first = app.gracefulShutdown()
    expect(app.gracefulShutdown()).toBe(first)
    expect((await closed)[0]).toBe(1001)
    await first
    expect(messages.some((message) => message.type === 'shutdown')).toBe(true)
  } finally { socket.terminate(); await app.gracefulShutdown() }
})
