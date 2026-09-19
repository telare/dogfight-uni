export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Інтерполяція кута по найкоротшому шляху на колі.
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
  if (!previous || !current) return current
  if (!current.alive || (!previous.alive && current.alive)) {
    return current
  }

  const prevX = previous.pos ? previous.pos.x : previous.x
  const prevY = previous.pos ? previous.pos.y : previous.y
  const currX = current.pos ? current.pos.x : current.x
  const currY = current.pos ? current.pos.y : current.y

  return {
    pos: {
      x: lerp(prevX, currX, alpha),
      y: lerp(prevY, currY, alpha),
    },
    x: lerp(prevX, currX, alpha),
    y: lerp(prevY, currY, alpha),
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrust: current.thrust,
    hp: current.hp,
    maxHp: current.maxHp || 100,
    shield: current.shield || 0,
    alive: current.alive,
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
  if (!ship || !ship.alive) return

  const x = ship.pos ? ship.pos.x : ship.x
  const y = ship.pos ? ship.pos.y : ship.y

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ship.angle)

  // Полум'я двигуна
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

  // Корпус корабля
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

  // Кабіна
  ctx.fillStyle = '#0284c7'
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
  ctx.fill()

  // Силовий щит (якщо активний)
  if (ship.shield > 0) {
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + Math.sin(performance.now() * 0.01) * 0.2})`
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, 0, 24, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fill()
  }

  ctx.restore()
}

export function drawBullet(ctx, bullet) {
  if (!bullet || !bullet.alive) return

  ctx.save()
  ctx.translate(bullet.pos.x, bullet.pos.y)
  ctx.rotate(bullet.angle)

  if (bullet.isHoming) {
    // Самонавідна ракета
    ctx.fillStyle = '#c084fc'
    ctx.shadowColor = '#a855f7'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(7, 0)
    ctx.lineTo(-5, -3)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-5, 3)
    ctx.closePath()
    ctx.fill()

    // Хвіст ракети
    ctx.fillStyle = '#f43f5e'
    ctx.beginPath()
    ctx.arc(-4, 0, 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Звичайний плазмовий заряд
    ctx.fillStyle = '#fef08a'
    ctx.shadowColor = '#38bdf8'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

export function drawAsteroid(ctx, asteroid) {
  if (!asteroid || !asteroid.alive) return

  ctx.save()
  ctx.translate(asteroid.pos.x, asteroid.pos.y)
  ctx.rotate(asteroid.angle)

  // Якщо астероїд-мисливець (homing через композицію), малюємо зловісне червоне свічення
  if (asteroid.isHoming) {
    ctx.strokeStyle = '#ef4444'
    ctx.shadowColor = '#dc2626'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#450a0a'
  } else {
    ctx.strokeStyle = '#94a3b8'
    ctx.shadowBlur = 0
    ctx.fillStyle = '#1e293b'
  }

  ctx.lineWidth = 2
  ctx.beginPath()

  const verts = asteroid.vertices || []
  if (verts.length > 0) {
    ctx.moveTo(verts[0].x, verts[0].y)
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x, verts[i].y)
    }
    ctx.closePath()
  } else {
    ctx.arc(0, 0, asteroid.radius, 0, Math.PI * 2)
  }

  ctx.fill()
  ctx.stroke()

  // Внутрішній візерунок / кратери
  ctx.fillStyle = asteroid.isHoming ? '#7f1d1d' : '#334155'
  ctx.beginPath()
  ctx.arc(
    asteroid.radius * 0.25,
    -asteroid.radius * 0.2,
    asteroid.radius * 0.2,
    0,
    Math.PI * 2,
  )
  ctx.arc(
    -asteroid.radius * 0.3,
    asteroid.radius * 0.25,
    asteroid.radius * 0.15,
    0,
    Math.PI * 2,
  )
  ctx.fill()

  ctx.restore()
}

export function drawPickup(ctx, pickup) {
  if (!pickup || !pickup.alive) return

  ctx.save()
  ctx.translate(pickup.pos.x, pickup.pos.y)

  const scale = 1 + Math.sin(pickup.pulse) * 0.15
  ctx.scale(scale, scale)

  let color = '#38bdf8'
  let label = '🛡'

  if (pickup.type === 'rapid') {
    color = '#f59e0b'
    label = '⚡'
  } else if (pickup.type === 'homing') {
    color = '#a855f7'
    label = '🎯'
  } else if (pickup.type === 'heal') {
    color = '#22c55e'
    label = '+'
  }

  // Пульсуюче коло аури
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'

  ctx.beginPath()
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Іконка/символ
  ctx.fillStyle = color
  ctx.font = 'bold 12px ui-monospace, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 1)

  ctx.restore()
}

export function drawExplosion(ctx, explosion) {
  if (!explosion || !explosion.alive) return

  ctx.save()
  for (const p of explosion.particles) {
    if (p.life > 0) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(p.pos.x, p.pos.y, p.size * (alpha * 0.6 + 0.4), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/**
 * Відмалювання всіх сутностей світу
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../sim/world.js').World} world
 * @param {Object} interpolatedShip
 */
export function drawWorldEntities(ctx, world, interpolatedShip) {
  for (const entity of world) {
    if (!entity.alive) continue

    if (entity.kind === 'ship') {
      drawShip(ctx, interpolatedShip || entity)
    } else if (entity.kind === 'bullet') {
      drawBullet(ctx, entity)
    } else if (entity.kind === 'asteroid') {
      drawAsteroid(ctx, entity)
    } else if (entity.kind === 'pickup') {
      drawPickup(ctx, entity)
    } else if (entity.kind === 'explosion') {
      drawExplosion(ctx, entity)
    }
  }
}

/**
 * Інформаційний HUD з відображенням життів (#hp), очок, сутностей та бонусів
 */
export function drawHud(ctx, stats, world, ship) {
  ctx.save()

  // Напівпрозора плашка під HUD
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
  if (ctx.roundRect) {
    ctx.roundRect(16, 16, 360, 230, 8)
  } else {
    ctx.rect(16, 16, 360, 230)
  }
  ctx.fill()
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace'

  // Лічильники продуктивності
  ctx.fillStyle = stats.stepsPerSecond >= 58 ? '#4ade80' : '#f87171'
  ctx.fillText(`steps/s    ${stats.stepsPerSecond}`, 28, 38)

  ctx.fillStyle = '#60a5fa'
  ctx.fillText(`frames/s   ${stats.framesPerSecond}`, 148, 38)

  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`ms: ${stats.frameTimeMs.toFixed(1)}`, 270, 38)

  // Стан здоров'я корабля (приватне поле #hp)
  const hp = ship ? ship.hp : 0
  const maxHp = ship ? ship.maxHp : 100
  const shield = ship ? ship.shield : 0

  // Смужка HP
  ctx.fillStyle = '#64748b'
  ctx.fillRect(28, 50, 150, 10)
  const hpWidth = Math.max(0, (hp / maxHp) * 150)
  ctx.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#eab308' : '#ef4444'
  ctx.fillRect(28, 50, hpWidth, 10)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText(`HP: ${hp}/${maxHp}`, 186, 59)

  if (shield > 0) {
    ctx.fillStyle = '#38bdf8'
    ctx.fillText(`SHIELD: ${shield}`, 268, 59)
  }

  // Очки та лічильник сутностей
  ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#fbbf24'
  ctx.fillText(`Рахунок:   ${ship ? ship.score : 0}`, 28, 80)

  ctx.fillStyle = '#c084fc'
  ctx.fillText(
    `Сутності:  ${world ? world.size : 0} (Map<id, Entity>)`,
    170,
    80,
  )

  // Повідомлення про відродження (Respawn)
  if (world && world.respawnTimer > 0) {
    ctx.fillStyle = '#f87171'
    ctx.font = 'bold 14px ui-monospace, monospace'
    ctx.fillText(
      `ВІДРОДЖЕННЯ ЧЕРЕЗ: ${world.respawnTimer.toFixed(1)} с`,
      28,
      104,
    )
  } else {
    // Статус бонусів
    const buffs = []
    if (ship && ship.rapidFireTimer > 0)
      buffs.push(`Швидкостріл (${ship.rapidFireTimer.toFixed(1)}s)`)
    if (ship && ship.homingTimer > 0)
      buffs.push(`Самонаведення (${ship.homingTimer.toFixed(1)}s)`)

    ctx.fillStyle = '#38bdf8'
    ctx.fillText(
      buffs.length > 0
        ? `Бонуси: ${buffs.join(' · ')}`
        : 'Бонуси: збивайте астероїди',
      28,
      104,
    )
  }

  // Інструкція для захисту та гарячі клавіші
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText('Керування: WASD/Стрілки · Space: Стрільба', 28, 128)
  ctx.fillText('[K] Демонстрація багу this (Unbound fire)', 28, 146)
  ctx.fillText('[H] Спавн Астероїда-мисливця (Homing)', 28, 164)
  ctx.fillText('[P] Спавн Бонуса (Pickup)', 28, 182)
  ctx.fillText('[1] BusyWait · [2] Interval · [3] VarStep', 28, 200)

  // Візуалізація результату тесту 'this'
  if (stats.lastThisBugLog) {
    ctx.fillStyle = stats.lastThisBugSuccess ? '#4ade80' : '#f87171'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(stats.lastThisBugLog, 28, 222)
  }

  ctx.restore()
}
