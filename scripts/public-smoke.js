import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'

const url = new URL(process.env.PUBLIC_URL)
assert.equal(url.protocol, 'https:')
const health = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(10000) }).then((r) => r.json())
assert.equal(health.version, process.env.EXPECTED_SHA)
assert.equal((await fetch(new URL('/ready', url))).status, 200)
const socket = new WebSocket(new URL('/ws', url).href.replace('https:', 'wss:'), { origin: url.origin })
try {
  await once(socket, 'open', { signal: AbortSignal.timeout(10000) })
  const welcome = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'join', room: 'room-alpha', name: 'release-smoke' }))
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome')
  // Stay connected beyond a typical 60s idle proxy timeout, with server heartbeats.
  await new Promise((resolve) => setTimeout(resolve, 70000))
  assert.equal(socket.readyState, 1)
  console.log(JSON.stringify({ https: true, wss: true, version: health.version, connectedSeconds: 70 }))
} finally { socket.close() }
