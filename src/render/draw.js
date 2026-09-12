export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Інтерполяція кута по найкоротшому шляху на колі.
 * Звичайний lerp(359°, 1°, 0.5) повертав би 180° (ніс корабля робить повний розворот).
 * lerpAngle зводить різницю до проміжку [-π, π].
 */
export function lerpAngle(from, to, t) {
  const tau = Math.PI * 2
  let delta = ((to - from) % tau) + tau
  delta %= tau
  if (delta > Math.PI) delta -= tau
  return from + delta * t
}

export function interpolateShip(previous, current, alpha) {
  return {
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha),
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrust: current.thrust,
  }
}

export function createStarfield(width, height, count = 160) {
  const stars = []
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * width,
      y: Math.abs((Math.sin(i * 78.233) * 24634.6345) % 1) * height,
      r: i % 6 === 0 ? 1.6 : 0.8,
      alpha: 0.3 + (Math.abs(Math.sin(i * 45.123)) % 0.7),
    })
  }
  return stars
}

export function drawBackground(ctx, width, height) {
  ctx.fillStyle = '#0b0d14'
  ctx.fillRect(0, 0, width, height)
}

export function drawGrid(ctx, width, height, step = 64) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= width; x += step) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
  }
  for (let y = 0; y <= height; y += step) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
  }
  ctx.stroke()
}

export function drawStarfield(ctx, stars) {
  for (const star of stars) {
    ctx.fillStyle = `rgba(180, 200, 240, ${star.alpha})`
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawShip(ctx, ship) {
  ctx.save()
  ctx.translate(ship.x, ship.y)
  ctx.rotate(ship.angle)

  // Візуалізація реактивного полум'я при тязі
  if (ship.thrust > 0) {
    const flameFlicker = 14 + Math.random() * 8
    ctx.fillStyle = '#fb923c'
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(-flameFlicker - 6, -5)
    ctx.lineTo(-flameFlicker, 0)
    ctx.lineTo(-flameFlicker - 6, 5)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(-flameFlicker * 0.6, -2.5)
    ctx.lineTo(-flameFlicker * 0.4, 0)
    ctx.lineTo(-flameFlicker * 0.6, 2.5)
    ctx.closePath()
    ctx.fill()
  }

  // Корпус корабля (стильний винищувач)
  ctx.fillStyle = '#f3f4f6'
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(-14, -12)
  ctx.lineTo(-8, 0)
  ctx.lineTo(-14, 12)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Кабіна пілота
  ctx.fillStyle = '#0284c7'
  ctx.beginPath()
  ctx.arc(0, 0, 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

export function drawHud(ctx, stats) {
  ctx.save()

  // Напівпрозора плашка під HUD для кращої читабельності
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
  ctx.roundRect(16, 16, 320, 160, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'
  ctx.stroke()

  ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace'

  // Лічильники
  ctx.fillStyle = stats.stepsPerSecond >= 58 ? '#4ade80' : '#f87171'
  ctx.fillText(`steps/s    ${stats.stepsPerSecond}`, 30, 42)

  ctx.fillStyle = '#60a5fa'
  ctx.fillText(`frames/s   ${stats.framesPerSecond}`, 30, 64)

  ctx.fillStyle = stats.frameTimeMs < 20 ? '#94a3b8' : '#fb923c'
  ctx.fillText(`frame ms   ${stats.frameTimeMs.toFixed(2)} ms`, 30, 86)

  // Підказки керування
  ctx.fillStyle = '#94a3b8'
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText('Керування: WASD / Стрілки · Пробіл: Пауза', 30, 114)

  // Статус експериментів M4
  ctx.fillStyle = stats.busyWait ? '#f87171' : '#64748b'
  ctx.fillText(`[1] 100ms Block: ${stats.busyWait ? 'ON' : 'OFF'}`, 30, 136)

  ctx.fillStyle = stats.useInterval ? '#fb923c' : '#64748b'
  ctx.fillText(`[2] setInterval: ${stats.useInterval ? 'ON' : 'OFF'}`, 30, 154)

  ctx.fillStyle = stats.variableTimestep ? '#e879f9' : '#64748b'
  ctx.fillText(
    `[3] Var Timestep: ${stats.variableTimestep ? 'ON' : 'OFF'}`,
    180,
    136,
  )

  ctx.restore()
}
