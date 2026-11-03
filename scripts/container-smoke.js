import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { WebSocket } from 'ws'

const exec = promisify(execFile)
const docker = async (...args) => (await exec('docker', args, { timeout: 120000 })).stdout.trim()
const image = process.argv[2] ?? 'dogfight:lab08'
const name = `dogfight-smoke-${Date.now()}`
const origin = 'http://localhost:3000'
const evidence = { image, at: new Date().toISOString() }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  evidence.sizeBytes = JSON.parse(await docker('image', 'inspect', image))[0].Size
  assert(evidence.sizeBytes < 200_000_000, 'Image must be under 200 MB')
  await docker('run', '-d', '--name', name, '--memory=256m', '--cpus=1', '-p', '127.0.0.1::3000', '-e', `ALLOWED_ORIGINS=${origin}`, '-e', 'SHUTDOWN_TIMEOUT_MS=1000', image)
  const info = JSON.parse(await docker('inspect', name))[0]
  const port = info.NetworkSettings.Ports['3000/tcp'][0].HostPort
  let base = `http://127.0.0.1:${port}`
  async function ready() {
    const state = JSON.parse(await docker('inspect', name))[0]
    base = `http://127.0.0.1:${state.NetworkSettings.Ports['3000/tcp'][0].HostPort}`
    for (let i = 0; i < 100; i++) {
      if (await fetch(base + '/ready').then((r) => r.ok).catch(() => false)) return
      await pause(100)
    }
    throw new Error(await docker('logs', name))
  }
  async function join() {
    const socket = new WebSocket(base.replace('http', 'ws') + '/ws', { origin })
    await once(socket, 'open')
    const welcome = once(socket, 'message')
    socket.send(JSON.stringify({ type: 'join', room: 'room-alpha', name: 'container-smoke' }))
    assert.equal(JSON.parse((await welcome)[0]).type, 'welcome')
    return socket
  }
  await ready()
  evidence.uid = await docker('exec', name, 'id', '-u')
  assert.notEqual(evidence.uid, '0')
  await docker('exec', name, 'node', '-e', "const fs=require('fs');for(const p of ['server/src','shared/src','node_modules/tsx','node_modules/typescript'])if(fs.existsSync(p))process.exit(1)")
  const socket = await join()
  const messages = []
  socket.on('message', (data, binary) => { if (!binary) messages.push(JSON.parse(data)) })
  const closed = once(socket, 'close')
  const stalled = await join()
  stalled._socket.pause() // Deliberately prevents the peer from completing its close handshake.
  const start = Date.now()
  await docker('kill', '--signal=SIGTERM', name)
  assert.equal((await fetch(base + '/ready').catch(() => ({ status: 503 }))).status, 503)
  assert.equal((await closed)[0], 1001)
  assert(messages.some((message) => message.type === 'shutdown'))
  evidence.exitCode = Number(await docker('wait', name))
  evidence.shutdownMs = Date.now() - start
  evidence.closeCode = 1001
  assert.equal(evidence.exitCode, 0)
  assert(evidence.shutdownMs < 10000)
  stalled.terminate()
  await docker('start', name); await ready()
  const killed = await join()
  const killedClosed = once(killed, 'close')
  await docker('kill', '--signal=SIGKILL', name)
  assert.equal((await killedClosed)[0], 1006)
  await docker('start', name); await ready()
  const recovered = await join(); recovered.close()
  evidence.restartRecovery = true
  const stopStart = Date.now()
  await docker('stop', '--time=10', name)
  evidence.dockerStopMs = Date.now() - stopStart
  assert.equal(Number(await docker('wait', name)), 0)
  evidence.logs = await docker('logs', name)
  await fs.mkdir('docs/production', { recursive: true })
  await fs.writeFile('docs/production/container-smoke.json', JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ ...evidence, logs: undefined }))
} finally { await docker('rm', '-f', name).catch(() => {}) }
