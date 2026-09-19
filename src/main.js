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
  drawHud,
  drawStarfield,
  drawWorldEntities,
  interpolateShip,
} from './render/draw.js'

const input = createInput(window)
let stars = []
let world = null
let ship = null

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
  },
})

// Створення ігрового світу на базі Map<number, Entity>
world = new World({ width: size.w, height: size.h })

// Створення корабля (успадковує Entity)
ship = new Ship({
  pos: new Vector2(size.w / 2, size.h / 2),
})
world.playerShip = ship
world.spawn(ship)

let previous = ship.cloneState()
stars = createStarfield(size.w, size.h)

// Спавн початкових астероїдів
for (let i = 0; i < 5; i++) {
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

// Спавн початкових бонусів для миттєвої перевірки
world.spawn(
  new Pickup({
    pos: new Vector2(size.w / 2 - 120, size.h / 2 - 80),
    type: 'shield',
  }),
)
world.spawn(
  new Pickup({
    pos: new Vector2(size.w / 2 + 120, size.h / 2 - 80),
    type: 'homing',
  }),
)

// Додатковий стан для HUD (лог тестування 'this')
const hudExtra = {
  lastThisBugLog: 'Натисніть [K] для тесту багу this',
  lastThisBugSuccess: true,
}

let toggleThisTest = false

/**
 * Інтерактивна демонстрація поведінки 'this':
 * 1. Небезпечний наївний виклик (Default Binding):
 *    Коли ship.fire передається як сире посилання на функцію без контексту,
 *    у суворому режимі (ES Modules / Classes) `this` стає undefined.
 *    Спроба звернутися до `this.#hp` або `this.pos` викликає TypeError!
 *
 * 2. Виправлений виклик через явний .bind() або стрілочну функцію:
 *    `ship.fire.bind(ship, world)()` гарантує передачу екземпляра ship.
 */
function runThisExperiment() {
  toggleThisTest = !toggleThisTest

  if (toggleThisTest) {
    try {
      console.log(
        '--- [Lab 02] Експеримент: Небезпечний виклик ship.fire без this ---',
      )
      // Сирий відрив методу від об'єкта
      const detachedFire = ship.fire
      // Правило 4: Default binding у strict mode -> this = undefined
      detachedFire()
    } catch (err) {
      console.error('Зловлено очікуваний баг this:', err)
      hudExtra.lastThisBugLog = `[Баг this]: ${err.name} (this is undefined)`
      hudExtra.lastThisBugSuccess = false
    }
  } else {
    console.log('--- [Lab 02] Експеримент: Виправлення через .bind(ship) ---')
    // Правило 2: Явне зв'язування Explicit Binding
    const boundFire = ship.fire.bind(ship, world)
    boundFire()
    hudExtra.lastThisBugLog =
      '[Фікс this]: ship.fire.bind(ship, world) постріл успішний!'
    hudExtra.lastThisBugSuccess = true
  }
}

// Стрільба кліком миші (демонструє правильне використання стрілочної функції)
window.addEventListener('click', (e) => {
  // Запобігаємо стрільбі, якщо клік був по інтерактивних елементах
  if (e.target.tagName === 'BUTTON') return
  // Фікс: стрілочна функція зберігає лексичний контекст
  ship.fire(world)
})

function simulate(dt) {
  previous = ship.cloneState()

  // Стрільба клавішею Space
  if (input.isDown('Space')) {
    ship.fire(world)
  }

  world.step(dt, input)

  hideWrapForLerp(previous, ship, size.w, size.h)
  input.consume()
}

function render(alpha, stats) {
  drawBackground(ctx, size.w, size.h)
  drawGrid(ctx, size.w, size.h)
  drawStarfield(ctx, stars)

  const interpolatedShip = interpolateShip(previous, ship, alpha)
  drawWorldEntities(ctx, world, interpolatedShip)

  drawHud(ctx, { ...stats, ...hudExtra }, world, ship)
}

const loop = createLoop({ simulate, render })
loop.start()

// Обробка гарячих клавіш
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault()
    if (loop.isRunning()) {
      loop.stop()
    } else {
      loop.start()
    }
  } else if (e.code === 'KeyK') {
    // Тестування багу this
    runThisExperiment()
  } else if (e.code === 'KeyH') {
    // Демонстрація композиції: астероїд із самонаведенням
    world.spawnHomingAsteroid()
    console.log(
      '[Lab 02] Заспавнено астероїд-мисливець (Homing via composition)',
    )
  } else if (e.code === 'KeyP') {
    // Демонстрація бонусу
    const types = ['shield', 'rapid', 'homing', 'heal']
    const type = types[Math.floor(Math.random() * types.length)]
    const pos = world.findSafeSpawnPos(20)
    world.spawn(new Pickup({ pos, type }))
    console.log(`[Lab 02] Заспавнено бонус (${type})`)
  } else if (e.code === 'Digit1') {
    const active = loop.toggleBusyWait()
    console.log(
      `[Lab 01] Експеримент 1 (100ms Busy-Wait): ${active ? 'Увімкнено' : 'Вимкнено'}`,
    )
  } else if (e.code === 'Digit2') {
    const active = loop.toggleInterval()
    console.log(
      `[Lab 01] Експеримент 2 (setInterval замість rAF): ${active ? 'Увімкнено' : 'Вимкнено'}`,
    )
  } else if (e.code === 'Digit3') {
    const active = loop.toggleVariableTimestep()
    console.log(
      `[Lab 01] Експеримент 3 (Змінний крок): ${active ? 'Увімкнено' : 'Вимкнено'}`,
    )
  }
})
