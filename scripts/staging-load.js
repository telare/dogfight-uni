import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { once } from 'node:events'
import { WebSocket } from 'ws'

const base = process.env.STAGING_URL
if (!base) throw new Error('Set STAGING_URL to an authorized staging HTTP(S) origin')
const origin = process.env.ORIGIN ?? new URL(base).origin
const count = Number(process.env.CLIENTS ?? 8)
const seconds = Number(process.env.SECONDS ?? 10)
assert(Number.isInteger(count) && count > 0 && count <= 128)
assert(seconds >= 1 && seconds <= 300)
const clients = []
const samples = []
let snapshots = 0
let healthyClosed = 0
let inputTimer
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function open(room, name) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws', { origin })
  socket.on('error', () => {})
  await once(socket, 'open')
  const welcome = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'join', room, name }))
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome')
  return socket
}
async function sample(phase) {
  const [stats, metrics] = await Promise.all([fetch(base + '/api/stats').then((r) => r.json()), fetch(base + '/metrics').then((r) => r.text())])
  samples.push({ phase, at: Date.now(), stats, metrics })
}
try {
  let room = process.env.ROOM
  if (!room) {
    const response = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Staging ${count}`, maxPlayers: count }) })
    assert.equal(response.status, 201)
    room = (await response.json()).id
  }
  for (let i = 0; i < count; i++) {
    const socket = await open(room, `load-${i}`)
    socket.on('message', () => snapshots++)
    socket.on('close', () => healthyClosed++)
    clients.push(socket)
  }
  let seq = 0
  inputTimer = setInterval(() => {
    const input = JSON.stringify({ type: 'input', seq: ++seq, tick: 0, thrust: 1, turn: 0.2, fire: true })
    for (const socket of clients) if (socket.readyState === 1) socket.send(input)
  }, 1000 / 60)
  await pause(2100); await sample('before')
  // Abrupt client loss in another room and reconnect with a fresh session.
  const lost = await open('room-nebula', 'lost-client'); lost.terminate()
  const replacement = await open('room-nebula', 'reconnected-client'); replacement.close()
  const attacker = await open('room-nebula', 'garbage-client')
  const closed = once(attacker, 'close')
  const flood = setInterval(() => { if (attacker.readyState === 1) attacker.send('garbage') }, 1)
  try { assert.equal((await closed)[0], 1002) } finally { clearInterval(flood) }
  await sample('during')
  for (let i = 0; i < seconds; i++) { await pause(1000); await sample('after') }
  const ticks = samples.map((sample) => sample.stats.rooms.find((r) => r.id === room)?.stats.tickP99Ms)
  const healthy = healthyClosed === 0 && snapshots > 0 && ticks.every((tick) => typeof tick === 'number' && tick < 33)
  const report = { base, origin, count, seconds, version: (await (await fetch(base + '/health')).json()).version, snapshots, healthyClosed, ticks, healthy, samples }
  await fs.mkdir('docs/production', { recursive: true })
  await fs.writeFile(`docs/production/staging-${Date.now()}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, samples: undefined }))
  assert(healthy, 'Isolation failed: healthy clients must remain connected and every sampled room tick p99 must be <33ms')
} finally { clearInterval(inputTimer); for (const socket of clients) socket.terminate() }
