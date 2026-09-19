/**
 * createLoop — ігровий цикл на основі Event Loop браузера.
 *
 * Особливості виконання JavaScript:
 * 1. Однопотоковість: стек викликів (call stack) виконує код до кінця (run-to-completion).
 *    Синхронний код не можна перервати.
 * 2. requestAnimationFrame: реєструє колбек прямо перед кроком рендерингу (paint) браузера,
 *    синхронізуючись із частотою оновлення монітора (60/120/144 Hz) та зупиняючись у фоні.
 * 3. Фіксований крок симуляції (Fix Your Timestep): симуляція оновлюється фіксованими порціями (step = 1/60 c).
 *    Акумулятор накопичує час між кадрами, захищаючись від "спіралі смерті" через Math.min(dt, 0.25).
 * 4. Інтерполяція (alpha): залишок акумулятора (accumulator / step) передається в рендер для плавного згладжування
 *    позицій між попереднім і поточним кроком симуляції.
 */
export function createLoop({ step = 1 / 60, simulate, render } = {}) {
  let rafId = 0
  let intervalId = 0
  let running = false
  let last = 0
  let accumulator = 0

  let stepsThisSecond = 0
  let framesThisSecond = 0
  let stepsPerSecond = 0
  let framesPerSecond = 0
  let frameTimeMs = 0
  let statsAt = 0

  // Прапорці для проведення та демонстрації експериментів M4
  let busyWait = false
  let frameCount = 0
  let useInterval = false
  let variableTimestep = false

  function tick(now) {
    if (!running) return

    const dt = last === 0 ? 0 : (now - last) / 1000
    last = now
    frameTimeMs = dt * 1000
    frameCount += 1

    // Експеримент 1: 100 мс синхронного блокування стека кожен 60-й кадр
    if (busyWait && frameCount % 60 === 0) {
      const blockUntil = performance.now() + 100
      while (performance.now() < blockUntil) {
        // call stack заблокований, жодна подія або paint не може виконатися
      }
    }

    if (variableTimestep) {
      // Експеримент 3: Змінний крок (без акумулятора)
      simulate(dt)
      stepsThisSecond += 1
      render(1, {
        stepsPerSecond,
        framesPerSecond,
        frameTimeMs,
        busyWait,
        useInterval,
        variableTimestep,
      })
    } else {
      // Стандартний режим: фіксований крок з акумулятором
      accumulator += Math.min(dt, 0.25)

      while (accumulator >= step) {
        simulate(step)
        accumulator -= step
        stepsThisSecond += 1
      }

      render(accumulator / step, {
        stepsPerSecond,
        framesPerSecond,
        frameTimeMs,
        busyWait,
        useInterval,
        variableTimestep,
      })
    }

    framesThisSecond += 1

    if (now - statsAt >= 1000) {
      stepsPerSecond = stepsThisSecond
      framesPerSecond = framesThisSecond
      stepsThisSecond = 0
      framesThisSecond = 0
      statsAt = now
    }

    if (!useInterval && running) {
      rafId = requestAnimationFrame(tick)
    }
  }

  function startScheduler() {
    last = 0
    accumulator = 0
    statsAt = 0
    frameCount = 0

    if (useInterval) {
      intervalId = setInterval(() => tick(performance.now()), 16)
    } else {
      rafId = requestAnimationFrame(tick)
    }
  }

  function stopScheduler() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = 0
    }
  }

  return {
    start() {
      if (running) return
      running = true
      startScheduler()
    },
    stop() {
      running = false
      stopScheduler()
    },
    isRunning: () => running,

    // Методи перемикання експериментів M4
    toggleBusyWait() {
      busyWait = !busyWait
      return busyWait
    },
    toggleInterval() {
      useInterval = !useInterval
      if (running) {
        stopScheduler()
        startScheduler()
      }
      return useInterval
    },
    toggleVariableTimestep() {
      variableTimestep = !variableTimestep
      accumulator = 0
      return variableTimestep
    },
    getExperimentsState: () => ({
      busyWait,
      useInterval,
      variableTimestep,
    }),
  }
}
