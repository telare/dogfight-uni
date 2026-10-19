import { query } from './dom.ts'
import type { LoadedAssets, LoadProgress } from './assets/loader.ts'
import type { LoopStats } from './loop.ts'
import type { RoomData, PickupType } from 'shared'
import './style.css'
import { createLoop } from './loop.ts'
import { createInput } from './input.ts'
import {
  Vector2,
  Ship,
  World,
  Asteroid,
  Pickup,
  hideWrapForLerp,
  wrap,
  PRNG,
} from 'shared'
import { createCanvas } from './render/canvas.ts'
import {
  createStarfield,
  drawBackground,
  drawGrid,
  drawStarfield,
  drawWorldEntities,
} from './render/draw.ts'
import { renderLoadingScreen } from './render/loadingScreen.ts'
import { loadAll } from './assets/loader.ts'
import { soundSystem } from './audio/audio.ts'
import { hudController } from './ui/hud.ts'
import { Lobby } from './lobby/lobby.ts'
import { LobbyView } from './lobby/lobbyView.ts'
import { runAssetBenchmark } from './assets/benchmark.ts'
import { gameConnection } from './net/connection.ts'
import { PredictionManager } from './net/prediction.ts'
import { InterpolationManager } from './net/interpolation.ts'
import { Netgraph } from './ui/netgraph.ts'

// Стан додатку
let gameState = 'loading' // 'loading' | 'lobby' | 'playing'
let loadingProgress: Omit<LoadProgress, 'item'> & { error?: unknown } = {
  progress: 0,
  loaded: 0,
  total: 0,
  currentItem: 'Початок ініціалізації...',
  error: null,
}

let loadedAssets: LoadedAssets | null = null
let stars: ReturnType<typeof createStarfield> = []
let world: World | null = null
let ship: Ship | null = null
let previous: ReturnType<Ship['cloneState']> | null = null
let lobby: Lobby | null = null
let lobbyView: LobbyView | null = null
let size = { w: 1200, h: 800 }

const input = createInput(window)

const canvasObj = createCanvas(query<HTMLCanvasElement>(document, '#game'), {
  onResize({ w, h }, activeCtx) {
    if (world) {
      world.arenaWidth = w
      world.arenaHeight = h
    }
    if (ship) {
      wrap(ship, w, h)
    }
    stars = createStarfield(w, h)
    const renderCtx = activeCtx
    if (gameState === 'loading' && renderCtx) {
      renderLoadingScreen(renderCtx, w, h, loadingProgress)
    }
  },
})
const ctx = canvasObj.ctx
size = canvasObj.size

stars = createStarfield(size.w, size.h)

// Менеджери мережевої синхронізації (Lab 05)
const prediction = new PredictionManager()
const interpolation = new InterpolationManager({
  arenaWidth: size.w,
  arenaHeight: size.h,
})
const netgraph = new Netgraph({
  gameConnection,
  predictionManager: prediction,
  interpolationManager: interpolation,
})

// Додатковий стан для HUD (лог тестування 'this' та Netcode)
const hudExtra = {
  lastThisBugLog: 'Натисніть [K] для тесту багу this · [N] для Netgraph',
  lastThisBugSuccess: true,
}

let toggleThisTest = false

/**
 * Інтерактивна демонстрація поведінки 'this' (збережено з Lab 02)
 */
function runThisExperiment() {
  if (!ship || !world) return
  toggleThisTest = !toggleThisTest

  if (toggleThisTest) {
    try {
      console.log(
        '--- [Lab 02/03] Експеримент: Небезпечний виклик ship.fire без this ---',
      )
      const detachedFire = ship.fire
      detachedFire(null)
    } catch (err) {
      console.error('Зловлено очікуваний баг this:', err)
      hudExtra.lastThisBugLog = `[Баг this]: ${err instanceof Error ? err.name : 'Error'} (this is undefined)`
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
 * Налаштування обробників мережевих подій WebSocket (Lab 05)
 */
gameConnection.on('welcome', (e) => {
  const welcome = e
  if (welcome.seed && world) {
    world.seed = welcome.seed
    world.prng = new PRNG(welcome.seed)
  }
  if (welcome.shipId && ship) {
    ship.assignId(welcome.shipId)
  }
  if (ship) {
    ship.name = lobby ? lobby.playerName : 'Pilot'
  }
  hudExtra.lastThisBugLog = `[WS] Підключено до сектора: ${welcome.room?.name || 'Sector'}`
})

gameConnection.on('snapshot', (e) => {
  const snapshot = e
  // 1. Буферизація та інтерполяція віддалених сутностей (M3)
  interpolation.addSnapshot(snapshot)

  // 2. Звірка локального корабля з авторитетним станом сервера (Reconciliation & Replay, M2)
  if (ship && world) {
    prediction.reconcile(snapshot, ship, world)
  }
})

/**
 * Ініціалізація та налаштування світу для обраної кімнати лобі
 */
function setupWorldForRoom(room: Pick<RoomData, 'id' | 'name' | 'difficulty'>) {
  world = new World({ width: size.w, height: size.h, seed: 42 })
  interpolation.arenaWidth = size.w
  interpolation.arenaHeight = size.h
  interpolation.reset()
  prediction.reset()

  // Створення корабля гравця
  ship = new Ship({
    pos: new Vector2(size.w / 2, size.h / 2),
    name: lobby ? lobby.playerName : 'Pilot',
  })
  world.playerShip = ship
  world.spawn(ship)
  previous = ship.cloneState()

  // Підключення до сокета кімнати в реальному часі
  if (room?.id) {
    gameConnection.connect(room.id, lobby ? lobby.playerName : 'Pilot')
  }

  // Підписка аудіо та HUD на події світу
  soundSystem.subscribeToWorld(world)
  hudController.subscribeToWorld(world)

  hudController.arenaName = room ? room.name : 'Standard Sector'
  hudController.playerName = lobby ? lobby.playerName : 'Pilot'

  // Кількість початкових астероїдів
  const asteroidCount =
    room?.difficulty === 'Extreme' ? 8 : room?.difficulty === 'Hard' ? 6 : 4

  for (let i = 0; i < asteroidCount; i++) {
    const spawnPos = world.findSafeSpawnPos(30)
    const angle = world.prng.random() * Math.PI * 2
    const speed = 40 + world.prng.random() * 60
    world.spawn(
      new Asteroid({
        pos: spawnPos,
        vel: Vector2.fromAngle(angle, speed),
        tier: 2,
      }),
    )
  }

  // Спавн бонусів
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

// Стрільба кліком миші та розблокування звуку
window.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return
  soundSystem.unlock()

  if (gameState !== 'playing') return
  if (
    e.target.tagName === 'BUTTON' ||
    e.target.closest('#lobby-overlay') ||
    e.target.closest('#netgraph-overlay')
  )
    return

  if (ship && world) {
    ship.fire(world)
    gameConnection.sendInput({
      seq: prediction.seq + 1,
      tick: 0,
      thrust: ship.thrust > 0 ? 1 : 0,
      turn: 0,
      fire: true,
    })
  }
})

function simulate(dt: number) {
  if (gameState !== 'playing' || !ship || !world) return

  previous = ship.cloneState()

  // Зчитування клавіш введення
  const left = input.isDown('ArrowLeft') || input.isDown('KeyA')
  const right = input.isDown('ArrowRight') || input.isDown('KeyD')
  const thrusting = input.isDown('ArrowUp') || input.isDown('KeyW')
  const firing = input.isDown('Space')

  const turn = (left ? -1 : 0) + (right ? 1 : 0)
  const thrust = thrusting ? 1 : 0
  const fire = firing

  // 1. Клієнтське передбачення (Client-Side Prediction, M2)
  const inputCmd = {
    seq: prediction.seq + 1,
    tick: 0,
    turn,
    thrust,
    fire,
  }

  const seq = prediction.predictStep(inputCmd, dt, world, ship)
  inputCmd.seq = seq

  // 2. Надсилання вводу на авторитетний сервер (M1 & M4 Binary/JSON)
  gameConnection.sendInput(inputCmd)

  // 3. Згасання візуального зсуву виправлення (Smoothing, M2)
  prediction.updateSmoothing(dt)

  // 4. Локальне оновлення симуляції
  world.step(dt)
  hudController.update(dt)

  hideWrapForLerp(previous, ship, size.w, size.h)
  input.consume()
}

function render(alpha: number, stats: LoopStats) {
  if (gameState === 'loading') {
    renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
    return
  }

  drawBackground(ctx, size.w, size.h)
  drawGrid(ctx, size.w, size.h)
  drawStarfield(ctx, stars)

  if (world && ship) {
    // Згладжена візуальна позиція корабля після prediction
    const renderPos = prediction.getRenderPosition(ship)
    const renderShip = {
      ...ship,
      pos: renderPos,
      x: renderPos.x,
      y: renderPos.y,
      angle: ship.angle,
      thrust: ship.thrust,
      hp: ship.hp,
      maxHp: ship.maxHp,
      shield: ship.shield,
      alive: ship.alive,
      name: ship.name,
      isLocal: true,
    }

    // Інтерпольовані сутності з мережі (інші кораблі, ворожі кулі, M3)
    const remoteEntities = interpolation.getInterpolatedEntities(ship.id)

    drawWorldEntities(
      ctx,
      world,
      renderShip,
      loadedAssets?.spritesheet,
      loadedAssets?.frames,
      remoteEntities,
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

    // Оновлення оверлею Netgraph
    netgraph.update()
  }
}

const loop = createLoop({ simulate, render })

// Гарячі клавіші
window.addEventListener('keydown', (e) => {
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
  } else if (e.code === 'KeyN') {
    netgraph.toggle()
  } else if (e.code === 'KeyK') {
    runThisExperiment()
  } else if (e.code === 'KeyH') {
    world?.spawnInitialAsteroids(1)
    console.log(
      '[Lab 03] Заспавнено астероїд-мисливець (Homing via composition)',
    )
  } else if (e.code === 'KeyP') {
    if (!world) return
    const types: PickupType[] = ['shield', 'rapid', 'homing', 'heal']
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
  } else if (e.code === 'Digit4') {
    netgraph.toggle()
  }
})

/**
 * Головний асинхронний пайплайн запуску додатку
 */
async function startApplication() {
  gameState = 'loading'
  renderLoadingScreen(ctx, size.w, size.h, loadingProgress)

  try {
    loadedAssets = await loadAll('/assets/manifest.json', {
      ctx: soundSystem.context,
      onProgress: (info) => {
        loadingProgress = info
        renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
      },
    })

    soundSystem.setBuffers(loadedAssets.sounds)

    setupWorldForRoom({
      id: 'room-alpha',
      name: 'Alpha Outpost (Casual)',
      difficulty: 'Normal',
    })

    loop.start()

    lobby = new Lobby({ apiUrl: '/api/rooms', playerName: 'Star-Pilot' })

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
      '%c[Dogfight] Lab 05 успішно ініціалізовано: Authoritative Server, Prediction, Reconciliation, Interpolation, DataView.',
      'color: #38bdf8; font-weight: bold; font-size: 13px',
    )
  } catch (err) {
    console.error('Критична помилка завантаження ассетів:', err)
    loadingProgress.error = err
    renderLoadingScreen(ctx, size.w, size.h, loadingProgress)
  }
}

startApplication()
