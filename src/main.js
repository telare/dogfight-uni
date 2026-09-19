import './style.css'
import { createLoop } from './loop.js'
import { createInput } from './input.js'
import { Vector2 } from './sim/vector.js'
import { Ship } from './sim/ship.js'
import { World } from './sim/world.js'
import { Asteroid } from './sim/asteroid.js'
import { Pickup } from './sim/pickup.js'
import { hideWrapForLerp, wrap } from './sim/arena.js'
import { createCanvas } from './render/canvas.js'
import {
  createStarfield,
  drawBackground,
  drawGrid,
  drawStarfield,
  drawWorldEntities,
  interpolateShip,
} from './render/draw.js'
import { renderLoadingScreen } from './render/loadingScreen.js'
import { loadAll } from './assets/loader.js'
import { soundSystem } from './audio/audio.js'
import { hudController } from './ui/hud.js'
import { Lobby } from './lobby/lobby.js'
import { LobbyView } from './lobby/lobbyView.js'
import { runAssetBenchmark } from './assets/benchmark.js'

// Стан додатку
let gameState = 'loading' // 'loading' | 'lobby' | 'playing'
let loadingProgress = {
  progress: 0,
  loaded: 0,
  total: 0,
  currentItem: 'Початок ініціалізації...',
  error: null,
}

let loadedAssets = null
let stars = []
let world = null
let ship = null
let previous = null
let lobby = null
let lobbyView = null

const input = createInput(window)

const { ctx, size } = createCanvas(document.querySelector('#game'), {
  onResize({ w, h }) {
    if (world) {
      world.arenaWidth = w
      world.arenaHeight = h
    }
    if (ship) {
      wrap(ship, w, h)
    }
    stars = createStarfield(w, h)
    if (gameState === 'loading') {
      renderLoadingScreen(ctx, w, h, loadingProgress)
    }
  },
})

stars = createStarfield(size.w, size.h)

// Додатковий стан для HUD (лог тестування 'this')
const hudExtra = {
  lastThisBugLog: 'Натисніть [K] для тесту багу this',
  lastThisBugSuccess: true,
}

let toggleThisTest = false

/**
 * Інтерактивна демонстрація поведінки 'this' (збережено з Lab 02)
 */
function runThisExperiment() {
  toggleThisTest = !toggleThisTest

  if (toggleThisTest) {
    try {
      console.log(
        '--- [Lab 02/03] Експеримент: Небезпечний виклик ship.fire без this ---',
      )
      const detachedFire = ship.fire
      detachedFire()
    } catch (err) {
      console.error('Зловлено очікуваний баг this:', err)
      hudExtra.lastThisBugLog = `[Баг this]: ${err.name} (this is undefined)`
      hudExtra.lastThisBugSuccess = false
    }
  } else {
    console.log(
      '--- [Lab 02/03] Експеримент: Виправлення через .bind(ship) ---',
    )
    const boundFire = ship.fire.bind(ship, world)
    boundFire()
    hudExtra.lastThisBugLog =
      '[Фікс this]: ship.fire.bind(ship, world) постріл успішний!'
    hudExtra.lastThisBugSuccess = true
  }
}

/**
 * Ініціалізація та налаштування світу для обраної кімнати лобі
 */
function setupWorldForRoom(room) {
  // Створення нового екземпляра World (успадковує EventTarget)
  world = new World({ width: size.w, height: size.h })

  // Створення корабля гравця
  ship = new Ship({
    pos: new Vector2(size.w / 2, size.h / 2),
  })
  world.playerShip = ship
  world.spawn(ship)
  previous = ship.cloneState()

  // Підписка аудіо та HUD на події світу через CustomEvents (EventTarget)
  // Повне розчеплення: симуляція НЕ знає про soundSystem чи hudController!
  soundSystem.subscribeToWorld(world)
  hudController.subscribeToWorld(world)

  hudController.arenaName = room ? room.name : 'Standard Sector'
  hudController.playerName = lobby ? lobby.playerName : 'Pilot'

  // Кількість початкових астероїдів залежить від складності кімнати
  const asteroidCount =
    room?.difficulty === 'Extreme' ? 8 : room?.difficulty === 'Hard' ? 6 : 4

  for (let i = 0; i < asteroidCount; i++) {
    const spawnPos = world.findSafeSpawnPos(30)
    const angle = Math.random() * Math.PI * 2
    const speed = 40 + Math.random() * 60
    world.spawn(
      new Asteroid({
        pos: spawnPos,
        vel: Vector2.fromAngle(angle, speed),
        tier: 2,
      }),
    )
  }

  // Спавн демонстраційних бонусів
  world.spawn(
    new Pickup({
      pos: new Vector2(size.w / 2 - 140, size.h / 2 - 80),
      type: 'shield',
    }),
  )
  world.spawn(
    new Pickup({
      pos: new Vector2(size.w / 2 + 140, size.h / 2 - 80),
      type: 'homing',
    }),
  )
}

// Стрільба кліком миші та розблокування звуку за першим жестом користувача
window.addEventListener('click', (e) => {
  // Розблоковуємо Web Audio API за жестом
  soundSystem.unlock()

  if (gameState !== 'playing') return
  if (e.target.tagName === 'BUTTON' || e.target.closest('#lobby-overlay'))
    return

  ship?.fire(world)
})

function simulate(dt) {
  if (gameState !== 'playing' || !ship || !world) return

  previous = ship.cloneState()

  // Стрільба клавішею Space
  if (input.isDown('Space')) {
    ship.fire(world)
  }

  world.step(dt, input)
  hudController.update(dt)

  hideWrapForLerp(previous, ship, size.w, size.h)
  input.consume()
}

function render(alpha, stats) {
  if (gameState === 'loading') {
    renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
    return
  }

  drawBackground(ctx, size.w, size.h)
  drawGrid(ctx, size.w, size.h)
  drawStarfield(ctx, stars)

  if (world && ship) {
    const interpolatedShip = interpolateShip(previous, ship, alpha)
    drawWorldEntities(
      ctx,
      world,
      interpolatedShip,
      loadedAssets?.spritesheet,
      loadedAssets?.frames,
    )

    if (gameState === 'playing') {
      hudController.render(
        ctx,
        { ...stats, ...hudExtra },
        world,
        ship,
        soundSystem.isUnlocked,
      )
    }
  }
}

const loop = createLoop({ simulate, render })

// Обробка гарячих клавіш
window.addEventListener('keydown', (e) => {
  // Розблокування звуку на будь-яку клавішу
  soundSystem.unlock()

  if (e.code === 'Escape' || e.code === 'KeyL') {
    if (gameState === 'playing') {
      gameState = 'lobby'
      lobbyView?.show()
      lobby?.leave()
    } else if (gameState === 'lobby') {
      gameState = 'playing'
      lobbyView?.hide()
      lobby?.join()
    }
  } else if (e.code === 'KeyK') {
    runThisExperiment()
  } else if (e.code === 'KeyH') {
    world?.spawnHomingAsteroid()
    console.log(
      '[Lab 03] Заспавнено астероїд-мисливець (Homing via composition)',
    )
  } else if (e.code === 'KeyP') {
    const types = ['shield', 'rapid', 'homing', 'heal']
    const type = types[Math.floor(Math.random() * types.length)]
    const pos = world.findSafeSpawnPos(20)
    world.spawn(new Pickup({ pos, type }))
    console.log(`[Lab 03] Заспавнено бонус (${type})`)
  } else if (e.code === 'KeyB') {
    console.log('[Lab 03] Запуск тесту бенчмарку завантаження ассетів...')
    runAssetBenchmark({ ctx: soundSystem.context, runs: 2 }).then((res) => {
      hudExtra.lastThisBugLog = `[Бенчмарк]: all: ${res.parAvgMs.toFixed(1)}ms vs seq: ${res.seqAvgMs.toFixed(1)}ms (${res.speedupFactor.toFixed(1)}x)`
    })
  } else if (e.code === 'Digit1') {
    const active = loop.toggleBusyWait()
    console.log(`[Lab 01] Busy-Wait: ${active ? 'ON' : 'OFF'}`)
  } else if (e.code === 'Digit2') {
    const active = loop.toggleInterval()
    console.log(`[Lab 01] setInterval: ${active ? 'ON' : 'OFF'}`)
  } else if (e.code === 'Digit3') {
    const active = loop.toggleVariableTimestep()
    console.log(`[Lab 01] Variable Step: ${active ? 'ON' : 'OFF'}`)
  }
})

/**
 * Головний асинхронний пайплайн запуску додатку (Lab 03)
 */
async function startApplication() {
  // 1. Показ екрана завантаження
  gameState = 'loading'
  renderLoadingScreen(ctx, size.w, size.h, loadingProgress)

  try {
    // 2. Асинхронне завантаження всіх ассетів через Promise.all
    loadedAssets = await loadAll('/assets/manifest.json', {
      ctx: soundSystem.context,
      onProgress: (info) => {
        loadingProgress = info
        renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
      },
    })

    // 3. Збереження декодованих аудіобуферів
    soundSystem.setBuffers(loadedAssets.sounds)

    // 4. Початкове налаштування світу
    setupWorldForRoom({
      id: 'room-alpha',
      name: 'Alpha Outpost (Casual)',
      difficulty: 'Normal',
    })

    // 5. Запуск ігрового циклу
    loop.start()

    // 6. Створення екземпляра моделі лобі та DOM-представлення
    lobby = new Lobby({ apiUrl: '/api/rooms.json', playerName: 'Star-Pilot' })

    lobbyView = new LobbyView(lobby, {
      onJoin: async (room) => {
        await soundSystem.unlock()
        setupWorldForRoom(room)
        gameState = 'playing'
      },
    })

    gameState = 'lobby'
    lobby.startPolling(4000)
    lobbyView.show()

    console.log(
      '%c[Dogfight] Lab 03 успішно ініціалізовано: Asset Pipeline, Web Audio, EventTarget Bus, Lobby.',
      'color: #38bdf8; font-weight: bold; font-size: 13px',
    )
  } catch (err) {
    console.error('Критична помилка завантаження ассетів:', err)
    loadingProgress.error = err
    renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
  }
}

// Старт
startApplication()
