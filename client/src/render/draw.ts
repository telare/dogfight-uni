import { assertNever, type World, type EntityData } from 'shared'
import type { SpriteFrame } from '../assets/loader.ts'
type Point = { readonly x: number; readonly y: number }
type Frames = Record<string, SpriteFrame>
type ShipView = {
  pos?: Point
  x?: number
  y?: number
  angle: number
  alive?: boolean
  hp?: number
  maxHp?: number
  shield?: number
  thrust?: number
  name?: string
}
type BulletView = {
  pos: Point
  angle: number
  alive?: boolean
  isHoming?: boolean | number
}
type AsteroidView = {
  pos: Point
  angle: number
  alive?: boolean
  radius: number
  tier?: number
  isHoming?: boolean
  vertices?: readonly Point[]
}
type PickupView = {
  pos: Point
  alive?: boolean
  radius: number
  pulse?: number
  type?: string
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/**
 * Інтерполяція кута по найкоротшому шляху на колі.
 * lerpAngle зводить різницю до проміжку [-π, π].
 */
export function lerpAngle(from: number, to: number, t: number) {
  const tau = Math.PI * 2
  let delta = ((to - from) % tau) + tau
  delta %= tau
  if (delta > Math.PI) delta -= tau
  return from + delta * t
}

export function createStarfield(width: number, height: number, count = 160) {
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

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#0b0d14'
  ctx.fillRect(0, 0, width, height)
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step = 64,
) {
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

export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  stars: ReturnType<typeof createStarfield>,
) {
  for (const star of stars) {
    ctx.fillStyle = `rgba(180, 200, 240, ${star.alpha})`
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawShip(
  ctx: CanvasRenderingContext2D,
  ship: ShipView,
  spritesheet: HTMLImageElement | null = null,
  frames: Frames | null = null,
  isLocal = true,
) {
  if (!ship || (!ship.alive && (ship.hp ?? 0) <= 0)) return

  const x = ship.pos?.x ?? ship.x ?? 0
  const y = ship.pos?.y ?? ship.y ?? 0

  ctx.save()
  ctx.translate(x, y)

  // Підпис позивного пілота над кораблем (Lab 05)
  if (ship.name) {
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.fillStyle = isLocal ? '#38bdf8' : '#f43f5e'
    ctx.textAlign = 'center'
    ctx.fillText(ship.name, 0, -24)
  }

  ctx.rotate(ship.angle)

  if (spritesheet && frames?.ship) {
    const frame =
      (ship.thrust ?? 0) > 0 && frames.shipThrust
        ? frames.shipThrust
        : frames.ship
    ctx.drawImage(
      spritesheet,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      -18,
      -18,
      36,
      36,
    )
  } else {
    // Полум'я двигуна
    if ((ship.thrust ?? 0) > 0) {
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

    // Корпус корабля: синій для свого, червоний для чужого пілота
    ctx.fillStyle = isLocal ? '#f3f4f6' : '#ffe4e6'
    ctx.strokeStyle = isLocal ? '#38bdf8' : '#f43f5e'
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
    ctx.fillStyle = isLocal ? '#0284c7' : '#e11d48'
    ctx.beginPath()
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Силовий щит (якщо активний)
  if ((ship.shield ?? 0) > 0) {
    ctx.strokeStyle = isLocal
      ? `rgba(56, 189, 248, ${0.4 + Math.sin(performance.now() * 0.01) * 0.2})`
      : `rgba(244, 63, 94, ${0.4 + Math.sin(performance.now() * 0.01) * 0.2})`
    ctx.fillStyle = isLocal
      ? 'rgba(56, 189, 248, 0.12)'
      : 'rgba(244, 63, 94, 0.12)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, 0, 24, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fill()
  }

  ctx.restore()
}

export function drawBullet(
  ctx: CanvasRenderingContext2D,
  bullet: BulletView,
  spritesheet: HTMLImageElement | null = null,
  frames: Frames | null = null,
) {
  if (!bullet || !bullet.alive) return

  ctx.save()
  ctx.translate(bullet.pos.x, bullet.pos.y)
  ctx.rotate(bullet.angle)

  if (spritesheet && frames) {
    const frame = bullet.isHoming ? frames.bulletHoming : frames.bulletNormal
    if (frame) {
      ctx.drawImage(
        spritesheet,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -10,
        -10,
        20,
        20,
      )
      ctx.restore()
      return
    }
  }

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

export function drawAsteroid(
  ctx: CanvasRenderingContext2D,
  asteroid: AsteroidView,
  spritesheet: HTMLImageElement | null = null,
  frames: Frames | null = null,
) {
  if (!asteroid || !asteroid.alive) return

  ctx.save()
  ctx.translate(asteroid.pos.x, asteroid.pos.y)
  ctx.rotate(asteroid.angle)

  if (spritesheet && frames) {
    let frame = null
    if (asteroid.isHoming) frame = frames.asteroidHoming
    else if (asteroid.tier === 2) frame = frames.asteroidLarge
    else frame = frames.asteroidMedium

    if (frame) {
      const r = asteroid.radius
      ctx.drawImage(
        spritesheet,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -r,
        -r,
        r * 2,
        r * 2,
      )
      ctx.restore()
      return
    }
  }

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
    ctx.moveTo(verts[0]!.x, verts[0]!.y)
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i]!.x, verts[i]!.y)
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

export function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: PickupView,
  spritesheet: HTMLImageElement | null = null,
  frames: Frames | null = null,
) {
  if (!pickup || !pickup.alive) return

  ctx.save()
  ctx.translate(pickup.pos.x, pickup.pos.y)

  const scale = 1 + Math.sin(pickup.pulse ?? 0) * 0.15
  ctx.scale(scale, scale)

  if (spritesheet && frames) {
    let frame = frames.pickupShield
    if (pickup.type === 'rapid') frame = frames.pickupRapid
    else if (pickup.type === 'homing') frame = frames.pickupHoming
    else if (pickup.type === 'heal') frame = frames.pickupHeal

    if (frame) {
      const r = pickup.radius
      ctx.drawImage(
        spritesheet,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -r,
        -r,
        r * 2,
        r * 2,
      )
      ctx.restore()
      return
    }
  }

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

export function drawWorldEntities(
  ctx: CanvasRenderingContext2D,
  world: World,
  interpolatedShip: ShipView,
  spritesheet: HTMLImageElement | null = null,
  frames: Frames | null = null,
  remoteEntities: readonly EntityData[] = [],
) {
  for (const entity of world) {
    if (!entity.alive) continue
    switch (entity.kind) {
      case 'ship':
        drawShip(ctx, interpolatedShip, spritesheet, frames, true)
        break
      case 'bullet':
        drawBullet(ctx, entity, spritesheet, frames)
        break
      case 'asteroid':
        drawAsteroid(ctx, entity, spritesheet, frames)
        break
      case 'pickup':
        drawPickup(ctx, entity, spritesheet, frames)
        break
      default:
        assertNever(entity)
    }
  }
  for (const remote of remoteEntities) {
    const pos = { x: remote.x, y: remote.y }
    switch (remote.kind) {
      case 'ship':
        drawShip(ctx, { ...remote, pos }, spritesheet, frames, false)
        break
      case 'bullet':
        drawBullet(ctx, { ...remote, pos }, spritesheet, frames)
        break
      case 'asteroid':
        if (!world.has(remote.id))
          drawAsteroid(
            ctx,
            {
              ...remote,
              pos,
              radius: remote.radius ?? (remote.tier === 1 ? 18 : 32),
            },
            spritesheet,
            frames,
          )
        break
      case 'pickup':
        if (!world.has(remote.id))
          drawPickup(
            ctx,
            { ...remote, pos, radius: remote.radius ?? 14 },
            spritesheet,
            frames,
          )
        break
      default:
        assertNever(remote)
    }
  }
}
