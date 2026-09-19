import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const publicAssetsDir = path.join(rootDir, 'public', 'assets')
const soundsDir = path.join(publicAssetsDir, 'sounds')

fs.mkdirSync(soundsDir, { recursive: true })

// -------------------------------------------------------------
// 1. WAV Sound Generator
// -------------------------------------------------------------
function writeWavFile(filepath, sampleRate, samples) {
  const numSamples = samples.length
  const bytesPerSample = 2
  const blockAlign = 1 * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // Mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34) // 16-bit
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff
    buffer.writeInt16LE(Math.round(int16), offset)
    offset += 2
  }

  fs.writeFileSync(filepath, buffer)
  console.log(`Generated: ${path.relative(rootDir, filepath)}`)
}

const sampleRate = 44100

// Laser sound (pew)
{
  const duration = 0.15
  const count = Math.floor(sampleRate * duration)
  const samples = new Float32Array(count)
  let phase = 0
  for (let i = 0; i < count; i++) {
    const t = i / count
    const freq = 880 * Math.exp(-t * 3.5) + 120
    phase += (2 * Math.PI * freq) / sampleRate
    const env = (1 - t) ** 1.8
    samples[i] = Math.sin(phase) * env * 0.7
  }
  writeWavFile(path.join(soundsDir, 'laser.wav'), sampleRate, samples)
}

// Hit sound (impact thump)
{
  const duration = 0.1
  const count = Math.floor(sampleRate * duration)
  const samples = new Float32Array(count)
  let phase = 0
  for (let i = 0; i < count; i++) {
    const t = i / count
    const freq = 160 * (1 - t * 0.7)
    phase += (2 * Math.PI * freq) / sampleRate
    const noise = (Math.random() * 2 - 1) * 0.3
    const env = (1 - t) ** 2
    samples[i] = (Math.sin(phase) * 0.7 + noise) * env * 0.8
  }
  writeWavFile(path.join(soundsDir, 'hit.wav'), sampleRate, samples)
}

// Explosion sound (crunch / boom)
{
  const duration = 0.45
  const count = Math.floor(sampleRate * duration)
  const samples = new Float32Array(count)
  let lastNoise = 0
  let bassPhase = 0
  for (let i = 0; i < count; i++) {
    const t = i / count
    const white = Math.random() * 2 - 1
    // Simple lowpass filter
    lastNoise = lastNoise * 0.82 + white * 0.18
    const bassFreq = 120 * (1 - t * 0.8) + 20
    bassPhase += (2 * Math.PI * bassFreq) / sampleRate
    const bass = Math.sin(bassPhase) * 0.4
    const env = (1 - t) ** 1.6
    samples[i] = (lastNoise * 0.7 + bass) * env * 0.85
  }
  writeWavFile(path.join(soundsDir, 'explosion.wav'), sampleRate, samples)
}

// Pickup chime (cheerful 4-note arpeggio)
{
  const duration = 0.28
  const count = Math.floor(sampleRate * duration)
  const samples = new Float32Array(count)
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
  let phase = 0
  for (let i = 0; i < count; i++) {
    const t = i / count
    const noteIdx = Math.min(notes.length - 1, Math.floor(t * notes.length))
    const freq = notes[noteIdx]
    phase += (2 * Math.PI * freq) / sampleRate
    const noteT = (t * notes.length) % 1
    const noteEnv = (1 - noteT) ** 1.2
    const totalEnv = 1 - t * 0.3
    samples[i] = Math.sin(phase) * noteEnv * totalEnv * 0.65
  }
  writeWavFile(path.join(soundsDir, 'pickup.wav'), sampleRate, samples)
}

// -------------------------------------------------------------
// 2. PNG Spritesheet Generator
// -------------------------------------------------------------
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[i] = c
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([lenBuf, typeAndData, crcBuf])
}

function encodePNG(width, height, rgbaBuffer) {
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(6, 9) // RGBA
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  const rawData = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1)
    rawData[rowOffset] = 0 // Filter None
    rgbaBuffer.copy(
      rawData,
      rowOffset + 1,
      y * width * 4,
      (y + 1) * width * 4,
    )
  }

  const compressed = zlib.deflateSync(rawData)
  const idat = makeChunk('IDAT', compressed)
  const iend = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([header, makeChunk('IHDR', ihdr), idat, iend])
}

// Let's create a 256x256 pixel buffer
const W = 256
const H = 256
const pixels = Buffer.alloc(W * H * 4, 0) // all transparent initially

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const idx = (Math.floor(y) * W + Math.floor(x)) * 4
  pixels[idx] = r
  pixels[idx + 1] = g
  pixels[idx + 2] = b
  pixels[idx + 3] = a
}

function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(cx + dx, cy + dy, r, g, b, a)
      }
    }
  }
}

function strokeCircle(cx, cy, radius, thickness, r, g, b, a = 255) {
  const innerR2 = (radius - thickness) * (radius - thickness)
  const outerR2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 <= outerR2 && d2 >= innerR2) {
        setPixel(cx + dx, cy + dy, r, g, b, a)
      }
    }
  }
}

// 1. Ship Idle: at (0, 0) size 48x48 (center 24, 24)
// Triangle facing right (angle 0)
for (let x = 8; x <= 40; x++) {
  const t = (x - 8) / 32
  const halfH = Math.round((1 - t) * 16)
  for (let y = 24 - halfH; y <= 24 + halfH; y++) {
    const isBorder = y === 24 - halfH || y === 24 + halfH || x === 40 || x === 8
    if (isBorder) {
      setPixel(x, y, 56, 189, 248) // cyan border
    } else if (Math.abs(y - 24) <= 2 && x > 20) {
      setPixel(x, y, 2, 132, 199) // cockpit
    } else {
      setPixel(x, y, 243, 244, 246) // white body
    }
  }
}

// 2. Ship Thrusting: at (48, 0) size 48x48 (center 72, 24)
for (let x = 8; x <= 40; x++) {
  const t = (x - 8) / 32
  const halfH = Math.round((1 - t) * 16)
  for (let y = 24 - halfH; y <= 24 + halfH; y++) {
    const isBorder = y === 24 - halfH || y === 24 + halfH || x === 40 || x === 8
    if (isBorder) {
      setPixel(48 + x, y, 56, 189, 248)
    } else if (Math.abs(y - 24) <= 2 && x > 20) {
      setPixel(48 + x, y, 2, 132, 199)
    } else {
      setPixel(48 + x, y, 243, 244, 246)
    }
  }
}
// Thruster flame at rear (x from 48 to 48+8)
for (let x = 50; x <= 56; x++) {
  const flameW = 24 - Math.abs(x - 56) * 3
  for (let y = 24 - 4; y <= 24 + 4; y++) {
    setPixel(x, y, 251, 146, 60)
  }
}
fillCircle(54, 24, 2, 254, 240, 138)

// 3. Asteroid Large: at (96, 0) size 48x48 (center 120, 24)
fillCircle(120, 24, 20, 30, 41, 59)
strokeCircle(120, 24, 20, 2, 148, 163, 184)
fillCircle(114, 20, 4, 51, 65, 85) // crater 1
fillCircle(126, 28, 3, 51, 65, 85) // crater 2

// 4. Asteroid Medium: at (144, 0) size 32x32 (center 160, 16)
fillCircle(160, 16, 12, 30, 41, 59)
strokeCircle(160, 16, 12, 2, 148, 163, 184)
fillCircle(158, 14, 3, 51, 65, 85)

// 5. Asteroid Homing: at (176, 0) size 32x32 (center 192, 16)
fillCircle(192, 16, 13, 69, 10, 10)
strokeCircle(192, 16, 13, 2, 239, 68, 68)
fillCircle(192, 16, 4, 185, 28, 28) // glowing eye

// 6. Bullets at row 48:
// Normal bullet: at (0, 48) size 24x24 (center 12, 60)
for (let x = 4; x <= 20; x++) {
  for (let y = 58; y <= 62; y++) {
    setPixel(x, y, 254, 240, 138)
  }
}
fillCircle(18, 60, 3, 56, 189, 248)

// Homing missile: at (24, 48) size 24x24 (center 36, 60)
for (let x = 28; x <= 44; x++) {
  for (let y = 58; y <= 62; y++) {
    setPixel(x, y, 192, 132, 252)
  }
}
setPixel(44, 60, 244, 63, 94) // warhead tip
setPixel(28, 57, 168, 85, 247) // fin top
setPixel(28, 63, 168, 85, 247) // fin bot

// 7. Pickups at row 48:
// Shield: (48, 48) size 32x32 (center 64, 64)
strokeCircle(64, 64, 12, 2, 56, 189, 248)
fillCircle(64, 64, 6, 56, 189, 248, 140)

// Rapid: (80, 48) size 32x32 (center 96, 64)
strokeCircle(96, 64, 12, 2, 245, 158, 11)
fillCircle(96, 64, 6, 245, 158, 11, 140)

// Homing: (112, 48) size 32x32 (center 128, 64)
strokeCircle(128, 64, 12, 2, 168, 85, 247)
fillCircle(128, 64, 6, 168, 85, 247, 140)

// Heal: (144, 48) size 32x32 (center 160, 64)
strokeCircle(160, 64, 12, 2, 34, 197, 94)
fillCircle(160, 64, 6, 34, 197, 94, 140)

const pngBuffer = encodePNG(W, H, pixels)
fs.writeFileSync(path.join(publicAssetsDir, 'sprites.png'), pngBuffer)
console.log(`Generated: public/assets/sprites.png (${pngBuffer.length} bytes)`)

// -------------------------------------------------------------
// 3. Manifest & Arena Config
// -------------------------------------------------------------
const manifest = {
  version: '1.0.0',
  sprites: {
    sheet: '/assets/sprites.png',
    frames: {
      ship: { x: 0, y: 0, w: 48, h: 48 },
      shipThrust: { x: 48, y: 0, w: 48, h: 48 },
      asteroidLarge: { x: 96, y: 0, w: 48, h: 48 },
      asteroidMedium: { x: 144, y: 0, w: 32, h: 32 },
      asteroidHoming: { x: 176, y: 0, w: 32, h: 32 },
      bulletNormal: { x: 0, y: 48, w: 24, h: 24 },
      bulletHoming: { x: 24, y: 48, w: 24, h: 24 },
      pickupShield: { x: 48, y: 48, w: 32, h: 32 },
      pickupRapid: { x: 80, y: 48, w: 32, h: 32 },
      pickupHoming: { x: 112, y: 48, w: 32, h: 32 },
      pickupHeal: { x: 144, y: 48, w: 32, h: 32 },
    },
  },
  sounds: {
    laser: '/assets/sounds/laser.wav',
    hit: '/assets/sounds/hit.wav',
    explosion: '/assets/sounds/explosion.wav',
    pickup: '/assets/sounds/pickup.wav',
  },
  arena: '/assets/arena.json',
}

fs.writeFileSync(
  path.join(publicAssetsDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
)
console.log('Generated: public/assets/manifest.json')

const arenaConfig = {
  name: 'Orion Sector',
  friction: 1.15,
  maxAsteroids: 6,
  starDensity: 160,
  respawnDelaySec: 2.0,
  pickupsEnabled: true,
  ambientColor: '#0b0d14',
}

fs.writeFileSync(
  path.join(publicAssetsDir, 'arena.json'),
  JSON.stringify(arenaConfig, null, 2),
)
console.log('Generated: public/assets/arena.json')

// Also create public/api/rooms.json for the lobby
const apiDir = path.join(rootDir, 'public', 'api')
fs.mkdirSync(apiDir, { recursive: true })

const rooms = [
  {
    id: 'room-alpha',
    name: 'Alpha Outpost (Casual)',
    players: 3,
    maxPlayers: 8,
    arena: 'standard',
    difficulty: 'Normal',
    pingMs: 16,
  },
  {
    id: 'room-nebula',
    name: 'Nebula Sector (High Velocity)',
    players: 5,
    maxPlayers: 8,
    arena: 'storm',
    difficulty: 'Hard',
    pingMs: 24,
  },
  {
    id: 'room-void',
    name: 'Deep Void (Hunter Asteroids)',
    players: 1,
    maxPlayers: 4,
    arena: 'dense',
    difficulty: 'Extreme',
    pingMs: 38,
  },
]

fs.writeFileSync(
  path.join(apiDir, 'rooms.json'),
  JSON.stringify(rooms, null, 2),
)
console.log('Generated: public/api/rooms.json')
