import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dogfight-runtime-'))
let child
const output = []
const origin = 'https://game.example'
try {
  for (const file of ['package.json', 'package-lock.json', 'server/package.json', 'client/package.json', 'shared/package.json']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await fs.copyFile(file, path.join(root, file))
  }
  for (const dir of ['client/dist', 'server/dist', 'shared/dist']) await fs.cp(dir, path.join(root, dir), { recursive: true })
  const npm = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit'], { cwd: root, shell: process.platform === 'win32', stdio: 'inherit' })
  assert.equal((await once(npm, 'exit'))[0], 0)
  for (const absent of ['node_modules/tsx', 'node_modules/typescript', 'shared/src', 'server/src']) await assert.rejects(fs.access(path.join(root, absent)))
  // IPC exercises the same exported drain on Windows, where SIGTERM is a forced kill.
  child = spawn(process.execPath, ['--input-type=module', '-e', `
    const app = await import('./server/dist/index.js');
    process.on('message', async () => { await app.gracefulShutdown(); process.disconnect(); });
    app.server.listen(0, '127.0.0.1', () => process.send(app.server.address().port));
  `], { cwd: root, env: { ...process.env, NODE_ENV: 'production', ALLOWED_ORIGINS: origin, ALLOW_MISSING_ORIGIN: 'false', ENABLE_DIAGNOSTICS: 'false', MAX_CONNECTIONS_PER_IP: '2', BUILD_SHA: 'smoke-test' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  child.stdout.on('data', (data) => output.push(data.toString()))
  child.stderr.on('data', (data) => output.push(data.toString()))
  const [port] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(output.join('')) })])
  const base = `http://127.0.0.1:${port}`
  assert.equal((await fetch(base + '/ready')).status, 200)
  assert.equal((await (await fetch(base + '/health')).json()).version, 'smoke-test')
  for (const endpoint of ['/api/slow', '/api/replays/no.ndjson', '/api/rooms/room-alpha/bots']) assert.equal((await fetch(base + endpoint, { method: endpoint.endsWith('/bots') ? 'POST' : 'GET' })).status, 404)
  assert.match(await (await fetch(base)).text(), /manifest.webmanifest/)
  for (const asset of ['/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png']) assert.equal((await fetch(base + asset)).status, 200)
  async function denied(headers) {
    const socket = new WebSocket(base.replace('http', 'ws') + '/ws', { headers })
    socket.on('error', () => {})
    const [request, response] = await once(socket, 'unexpected-response')
    // ws emits request, response.
    assert.equal(response.statusCode, 401)
    response.resume()
    request.destroy()
    socket.terminate()
  }
  await denied({ Origin: 'https://attacker.example' })
  await denied({})
  const socket = new WebSocket(base.replace('http', 'ws') + '/ws', { origin })
  await once(socket, 'open')
  const welcome = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'join', room: 'room-alpha', name: '<b>Pilot</b>' }))
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome')
  const flood = new WebSocket(base.replace('http', 'ws') + '/ws', { origin })
  await once(flood, 'open')
  await denied({ Origin: origin, 'X-Forwarded-For': '1.2.3.4' })
  const floodClosed = once(flood, 'close')
  flood.send('garbage')
  assert.equal((await floodClosed)[0], 1002)
  const metrics = await (await fetch(base + '/metrics')).text()
  assert.match(metrics, /reason="origin"} 2/)
  assert.match(metrics, /reason="ip_limit"} 1/)
  assert.match(metrics, /dogfight_messagesOut_total [1-9]/)
  const messages = []
  socket.on('message', (data, binary) => { if (!binary) messages.push(JSON.parse(data)) })
  const closed = once(socket, 'close')
  const exited = once(child, 'exit')
  const start = Date.now()
  child.send('shutdown')
  assert.equal((await closed)[0], 1001)
  assert(messages.some((message) => message.type === 'shutdown'))
  assert.equal((await exited)[0], 0)
  assert(Date.now() - start < 10000)
  console.log(JSON.stringify({ productionOnly: true, noSource: true, originAndIpLimits: true, protocolRejection: true, shutdownCode: 1001, shutdownMs: Date.now() - start }))
} finally {
  child?.kill()
  // Only the exact temporary directory allocated above is removed.
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
