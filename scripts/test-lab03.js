import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HttpError,
  isNonRetryable,
  withRetry,
} from '../client/src/assets/loader.ts'
import { World } from '../shared/src/sim/world.ts'
import { Ship } from '../shared/src/sim/ship.ts'
import { Asteroid } from '../shared/src/sim/asteroid.ts'
import { Vector2 } from '../shared/src/sim/vector.ts'
import { resolveCollisions } from '../shared/src/sim/collision.ts'
import { Lobby } from '../client/src/lobby/lobby.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

console.log('🧪 Запуск автоматичних тестів вимог Lab 03...\n')

// -------------------------------------------------------------
// Тест 1: isNonRetryable та withRetry (Ніколи не повторювати 4xx!)
// -------------------------------------------------------------
console.log('Тест 1: Перевірка withRetry та заборони повтору 4xx помилок...')

assert.strictEqual(
  isNonRetryable(new HttpError(404, 'Not Found', '/test')),
  true,
)
assert.strictEqual(
  isNonRetryable(new HttpError(400, 'Bad Request', '/test')),
  true,
)
assert.strictEqual(
  isNonRetryable(new HttpError(500, 'Internal Server Error', '/test')),
  false,
)
assert.strictEqual(
  isNonRetryable(new HttpError(503, 'Service Unavailable', '/test')),
  false,
)
assert.strictEqual(
  isNonRetryable(new DOMException('Aborted', 'AbortError')),
  true,
)

// Перевірка, що 404 робить РІВНО 1 спробу (жодних повторів!)
let attempts404 = 0
try {
  await withRetry(
    () => {
      attempts404++
      throw new HttpError(404, 'Not Found', '/missing.png')
    },
    { attempts: 5, baseMs: 10 },
  )
  assert.fail('Мав викинути HttpError 404')
} catch (err) {
  assert.strictEqual(err.status, 404)
  assert.strictEqual(
    attempts404,
    1,
    'withRetry НЕ повинен повторювати помилку 404!',
  )
}

// Перевірка, що 500 повторюється до вичерпання спроб
let attempts500 = 0
try {
  await withRetry(
    () => {
      attempts500++
      throw new HttpError(500, 'Server Error', '/api')
    },
    { attempts: 3, baseMs: 10 },
  )
  assert.fail('Мав викинути помилку після 3 спроб')
} catch (err) {
  assert.strictEqual(
    attempts500,
    3,
    'withRetry повинен повторювати 5xx зазначену кількість разів',
  )
}

// Перевірка скасування через AbortSignal
const abortController = new AbortController()
abortController.abort()
let attemptsAbort = 0
try {
  await withRetry(
    () => {
      attemptsAbort++
      throw new Error('fail')
    },
    { attempts: 3, baseMs: 10, signal: abortController.signal },
  )
  assert.fail('Мав викинути AbortError')
} catch (err) {
  assert.strictEqual(err.name, 'AbortError')
  assert.strictEqual(
    attemptsAbort,
    0,
    'Операція з перерваним сигналом не повинна запускатись',
  )
}
console.log('✅ Тест 1 пройдено: withRetry працює суворо за специфікацією.\n')

// -------------------------------------------------------------
// Тест 2: Архітектурне розчеплення (Zero imports of audio/HUD in sim)
// -------------------------------------------------------------
console.log(
  'Тест 2: Перевірка нульових імпортів audio та HUD у каталозі src/sim/...',
)
const simDir = path.join(rootDir, 'shared', 'src', 'sim')
const simFiles = fs.readdirSync(simDir).filter((f) => f.endsWith('.ts'))

for (const file of simFiles) {
  const content = fs.readFileSync(path.join(simDir, file), 'utf8')
  const forbiddenPatterns = [
    /import.*from.*['"].*audio.*['"]/i,
    /import.*from.*['"].*hud.*['"]/i,
    /import.*from.*['"].*render.*['"]/i,
    /import.*from.*['"].*lobby.*['"]/i,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.strictEqual(
      pattern.test(content),
      false,
      `Файл ${file} містить заборонений імпорт (${pattern})! Симуляція повинна бути на 100% розчеплена через EventTarget.`,
    )
  }
}
console.log(
  `✅ Тест 2 пройдено: усі ${simFiles.length} файлів у src/sim/ мають 0 заборонених імпортів.\n`,
)

// -------------------------------------------------------------
// Тест 3: Диспетчеризація подій World (EventTarget CustomEvents)
// -------------------------------------------------------------
console.log('Тест 3: Перевірка шини подій World (EventTarget CustomEvent)...')
const world = new World({ width: 800, height: 600 })
assert.equal(
  typeof world.on,
  'function',
  'World exposes typed bus subscriptions',
)

const receivedEvents = []
world.addEventListener('fired', (e) =>
  receivedEvents.push({ type: 'fired', detail: e.detail }),
)
world.addEventListener('hit', (e) =>
  receivedEvents.push({ type: 'hit', detail: e.detail }),
)
world.addEventListener('exploded', (e) =>
  receivedEvents.push({ type: 'exploded', detail: e.detail }),
)
world.addEventListener('score', (e) =>
  receivedEvents.push({ type: 'score', detail: e.detail }),
)
world.addEventListener('respawn', (e) =>
  receivedEvents.push({ type: 'respawn', detail: e.detail }),
)

const ship = new Ship({ pos: new Vector2(400, 300) })
world.playerShip = ship
world.spawn(ship)

// 3.1. Тест fired
ship.fire(world)
assert.strictEqual(
  receivedEvents.filter((e) => e.type === 'fired').length,
  1,
  'Подія fired має бути відправлена',
)

// 3.2. Тест hit, exploded та score при колізії
const asteroid = new Asteroid({ pos: new Vector2(600, 300), tier: 1 })
world.spawn(asteroid)
const bullet = Array.from(world.ofKind('bullet'))[0]
if (bullet) {
  bullet.pos = asteroid.pos.clone()
  resolveCollisions(world)
}

assert.ok(
  receivedEvents.some((e) => e.type === 'hit'),
  'Подія hit має бути відправлена',
)
assert.ok(
  receivedEvents.some((e) => e.type === 'exploded'),
  'Подія exploded має бути відправлена',
)
assert.ok(
  receivedEvents.some((e) => e.type === 'score'),
  'Подія score має бути відправлена',
)

console.log(
  '✅ Тест 3 пройдено: World успішно генерує fired, hit, exploded, score через CustomEvents.\n',
)

// -------------------------------------------------------------
// Тест 4: Модель Lobby (EventTarget, refresh, abort-on-join)
// -------------------------------------------------------------
console.log('Тест 4: Перевірка Lobby (EventTarget, join, abort)...')
const lobby = new Lobby({ apiUrl: '/api/rooms.json', playerName: 'Falcon' })
assert.equal(
  typeof lobby.on,
  'function',
  'Lobby exposes typed bus subscriptions',
)

let joinedEvent = null
lobby.on('joined', (e) => {
  joinedEvent = e
})

lobby.rooms = [
  { id: 'room-1', name: 'Sector 1', players: 2, maxPlayers: 8 },
  { id: 'room-2', name: 'Sector 2', players: 4, maxPlayers: 8 },
]
lobby.selectRoom('room-2')
lobby.startPolling(5000)

const joinedRoom = lobby.join()
assert.strictEqual(joinedRoom.id, 'room-2')
assert.ok(joinedEvent, 'Lobby має відправити подію joined')
assert.strictEqual(joinedEvent.playerName, 'Falcon')
lobby.stopPolling()

console.log('✅ Тест 4 пройдено: Lobby працює коректно.\n')

console.log('🎉 УСІ ТЕСТИ LAB 03 УСПІШНО ПРОЙДЕНО!')
