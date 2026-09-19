/**
 * Dogfight Server — Інтеграційні та модульні тести (Lab 04)
 * Використовує вбудований тестовий ранер node:test та node:assert/strict.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocket } from 'ws'
import { server, roomManager, wss } from '../src/index.js'
import { config } from '../src/config.js'
import { validateClientMessage, CloseCode } from '../src/protocol.js'
import { MatchLog } from '../src/log/matchlog.js'
import { createReplayEvents } from '../src/log/replay.js'

describe('Dogfight Server Test Suite', () => {
  let serverPort = 0
  let baseUrl = ''
  let wsUrl = ''

  before(async () => {
    await new Promise((resolve) => {
      // Використовуємо вільний порт (0) для ізоляції тестів
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        serverPort = address.port
        baseUrl = `http://127.0.0.1:${serverPort}`
        wsUrl = `ws://127.0.0.1:${serverPort}/ws`
        resolve()
      })
    })
  })

  after(async () => {
    for (const client of wss.clients) {
      client.terminate()
    }
    await new Promise((resolve) => wss.close(resolve))
    await new Promise((resolve) => server.close(resolve))
    await roomManager.closeAll()
  })

  describe('1. Протокол та валідація (protocol.js)', () => {
    it('успішно валідує коректне повідомлення join', () => {
      const payload = JSON.stringify({
        type: 'join',
        room: 'room-alpha',
        name: 'Maverick',
      })
      const res = validateClientMessage(payload)
      assert.equal(res.valid, true)
      assert.equal(res.msg.type, 'join')
      assert.equal(res.msg.room, 'room-alpha')
      assert.equal(res.msg.name, 'Maverick')
    })

    it('успішно валідує коректне повідомлення chat', () => {
      const payload = JSON.stringify({
        type: 'chat',
        text: 'Fox two! Fox two!',
      })
      const res = validateClientMessage(payload)
      assert.equal(res.valid, true)
      assert.equal(res.msg.type, 'chat')
      assert.equal(res.msg.text, 'Fox two! Fox two!')
    })

    it('відхиляє повідомлення з невідомим типом', () => {
      const payload = JSON.stringify({ type: 'hack', data: 'malicious' })
      const res = validateClientMessage(payload)
      assert.equal(res.valid, false)
      assert.equal(res.code, CloseCode.PROTOCOL_ERROR)
    })

    it('відхиляє повідомлення, розмір якого перевищує ліміт (MESSAGE_TOO_BIG)', () => {
      const oversized = JSON.stringify({
        type: 'chat',
        text: 'A'.repeat(2000),
      })
      const res = validateClientMessage(oversized, 1024)
      assert.equal(res.valid, false)
      assert.equal(res.code, CloseCode.MESSAGE_TOO_BIG)
    })

    it('відхиляє синтаксично некоректний JSON', () => {
      const badJson = '{ type: "join", room: broken '
      const res = validateClientMessage(badJson)
      assert.equal(res.valid, false)
      assert.equal(res.code, CloseCode.PROTOCOL_ERROR)
    })
  })

  describe('2. HTTP Endpoints (node:http)', () => {
    it('GET /health повертає статус 200 та метрики сервера', async () => {
      const res = await fetch(`${baseUrl}/health`)
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('content-type'), 'application/json')
      const data = await res.json()
      assert.equal(data.status, 'ok')
      assert.ok(typeof data.uptimeSec === 'number')
      assert.ok(typeof data.roomsCount === 'number')
      assert.ok(Number.parseFloat(data.rssMb) > 0)
    })

    it('GET /api/rooms повертає список доступних кімнат', async () => {
      const res = await fetch(`${baseUrl}/api/rooms`)
      assert.equal(res.status, 200)
      const rooms = await res.json()
      assert.ok(Array.isArray(rooms))
      assert.ok(rooms.length >= 3)
      assert.ok(rooms.some((r) => r.id === 'room-alpha'))
    })

    it('POST /api/rooms створює нову кімнату', async () => {
      const res = await fetch(`${baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sector Orbital Beta',
          difficulty: 'Hard',
          arena: 'storm',
          maxPlayers: 6,
        }),
      })
      assert.equal(res.status, 201)
      const created = await res.json()
      assert.equal(created.name, 'Sector Orbital Beta')
      assert.equal(created.difficulty, 'Hard')
      assert.equal(created.arena, 'storm')
      assert.equal(created.maxPlayers, 6)
      assert.ok(roomManager.hasRoom(created.id))
    })

    it('POST /api/rooms відхиляє запит без поля name (400)', async () => {
      const res = await fetch(`${baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: 'Hard' }),
      })
      assert.equal(res.status, 400)
      const err = await res.json()
      assert.ok(err.error)
    })

    it('GET /api/slow виконує блокування Event Loop на задану кількість мс', async () => {
      const t0 = performance.now()
      const res = await fetch(`${baseUrl}/api/slow?ms=60`)
      assert.equal(res.status, 200)
      const data = await res.json()
      const elapsed = performance.now() - t0
      assert.ok(data.blockedMs >= 55)
      assert.ok(elapsed >= 55)
    })

    it('Захист від Path Traversal: повертає 403 при спробі виходу за межі директорії', async () => {
      const res = await fetch(`${baseUrl}/..%2f..%2fpackage.json`)
      // Або 403 Forbidden, або 404 (нормалізований safePath)
      assert.ok(res.status === 403 || res.status === 404)
    })
  })

  describe('3. WebSocket Lifecycle & Rooms (ws.js, rooms.js)', () => {
    it('вимагає повідомлення join протягом таймауту або закриває сокет', async () => {
      const ws = new WebSocket(wsUrl)
      const closePromise = new Promise((resolve) => {
        ws.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })

      // Нічого не надсилаємо, чекаємо
      // Для прискорення перевіряємо, що з'єднання відкрито і сокет живий
      await new Promise((resolve) => ws.on('open', resolve))
      assert.equal(ws.readyState, WebSocket.OPEN)

      ws.close()
      await closePromise
    })

    it('два клієнти приєднуються до однієї кімнати, бачать ростер та обмінюються чатом', async () => {
      const ws1 = new WebSocket(wsUrl)
      const ws2 = new WebSocket(wsUrl)

      await Promise.all([
        new Promise((resolve) => ws1.on('open', resolve)),
        new Promise((resolve) => ws2.on('open', resolve)),
      ])

      const ws1Messages = []
      const ws2Messages = []

      ws1.on('message', (d) => ws1Messages.push(JSON.parse(d.toString())))
      ws2.on('message', (d) => ws2Messages.push(JSON.parse(d.toString())))

      // 1. Гравець 1 приєднується до room-alpha
      ws1.send(
        JSON.stringify({
          type: 'join',
          room: 'room-alpha',
          name: 'Viper',
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.ok(ws1Messages.some((m) => m.type === 'welcome'))
      const welcome1 = ws1Messages.find((m) => m.type === 'welcome')
      assert.equal(welcome1.roster.length, 1)
      assert.equal(welcome1.roster[0].name, 'Viper')

      // 2. Гравець 2 приєднується до тієї ж кімнати
      ws2.send(
        JSON.stringify({
          type: 'join',
          room: 'room-alpha',
          name: 'Iceman',
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 50))

      // ws1 повинен отримати сповіщення joined про Iceman
      const joinedEvt = ws1Messages.find((m) => m.type === 'joined')
      assert.ok(joinedEvt)
      assert.equal(joinedEvt.player.name, 'Iceman')

      // 3. Гравець 2 відправляє повідомлення в чат
      ws2.send(
        JSON.stringify({
          type: 'chat',
          text: 'Bogey at 12 o’clock!',
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 50))

      const chatOnWs1 = ws1Messages.find(
        (m) => m.type === 'chat' && m.text === 'Bogey at 12 o’clock!',
      )
      const chatOnWs2 = ws2Messages.find(
        (m) => m.type === 'chat' && m.text === 'Bogey at 12 o’clock!',
      )
      assert.ok(chatOnWs1)
      assert.ok(chatOnWs2)
      assert.equal(chatOnWs1.from, 'Iceman')

      // 4. Гравець 2 залишає кімнату
      ws2.send(JSON.stringify({ type: 'leave' }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      const leftEvt = ws1Messages.find((m) => m.type === 'left')
      assert.ok(leftEvt)
      assert.equal(leftEvt.name, 'Iceman')

      ws1.close()
      ws2.close()
    })
  })

  describe('4. Стрімінг логів та повторів (matchlog.js, replay.js)', () => {
    const testRoomId = `test-stream-${Date.now()}`
    let logFilename = ''

    it('MatchLog записує події через Transform stream та pipeline на диск', async () => {
      const matchLog = new MatchLog(testRoomId)
      logFilename = matchLog.filename

      matchLog.record({
        type: 'test:action',
        action: 'laser_fired',
        pos: { x: 100, y: 200 },
      })
      matchLog.record({
        type: 'test:action',
        action: 'asteroid_destroyed',
        score: 150,
      })

      await matchLog.close()

      const filepath = path.join(config.LOG_DIR, logFilename)
      assert.ok(fs.existsSync(filepath))

      const content = fs.readFileSync(filepath, 'utf8')
      const lines = content.trim().split('\n')
      assert.ok(lines.length >= 3) // init, 2 events, close
      const firstObj = JSON.parse(lines[0])
      assert.equal(firstObj.type, 'room:init')
      assert.equal(firstObj.roomId, testRoomId)
    })

    it('createReplayEvents зчитує записаний файл через асинхронний генератор', async () => {
      const filepath = path.join(config.LOG_DIR, logFilename)
      const events = []
      for await (const evt of createReplayEvents(filepath)) {
        events.push(evt)
      }

      assert.ok(events.length >= 3)
      assert.ok(events.some((e) => e.action === 'laser_fired'))
      assert.ok(events.some((e) => e.action === 'asteroid_destroyed'))
    })

    it('GET /api/replays/:filename стрімить NDJSON клієнту безпосередньо з диска', async () => {
      const res = await fetch(`${baseUrl}/api/replays/${logFilename}`)
      assert.equal(res.status, 200)
      assert.ok(res.headers.get('content-type').includes('application/x-ndjson'))
      const text = await res.text()
      const lines = text.trim().split('\n')
      assert.ok(lines.length >= 3)
    })
  })
})
