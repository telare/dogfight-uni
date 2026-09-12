import './style.css'
import { createLoop } from './loop.js'
import { createInput } from './input.js'
import { cloneShip, createShip, integrate } from './sim/ship.js'
import { hideWrapForLerp, wrap } from './sim/arena.js'
import { createCanvas } from './render/canvas.js'
import {
  createStarfield,
  drawBackground,
  drawGrid,
  drawHud,
  drawShip,
  drawStarfield,
  interpolateShip,
} from './render/draw.js'

const input = createInput(window)
const ship = createShip()
let previous = cloneShip(ship)
let stars = []

const { ctx, size } = createCanvas(document.querySelector('#game'), {
  onResize({ w, h }) {
    wrap(ship, w, h)
    stars = createStarfield(w, h)
  },
})

// Початкове розміщення корабля в центрі арени
ship.x = size.w / 2
ship.y = size.h / 2
previous = cloneShip(ship)

function simulate(dt) {
  previous = cloneShip(ship)
  integrate(ship, input, dt)
  wrap(ship, size.w, size.h)
  hideWrapForLerp(previous, ship, size.w, size.h)
  input.consume()
}

function render(alpha, stats) {
  drawBackground(ctx, size.w, size.h)
  drawGrid(ctx, size.w, size.h)
  drawStarfield(ctx, stars)
  drawShip(ctx, interpolateShip(previous, ship, alpha))
  drawHud(ctx, stats)
}

const loop = createLoop({ simulate, render })
loop.start()

// Гарячі клавіші для інтерактивного захисту лабораторної
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    if (loop.isRunning()) {
      loop.stop()
    } else {
      loop.start()
    }
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
      `[Lab 01] Експеримент 3 (Змінний крок замість фіксованого): ${active ? 'Увімкнено' : 'Вимкнено'}`,
    )
  }
})
