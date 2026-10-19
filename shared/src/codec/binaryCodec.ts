import {
  EntitySchema,
  asTick,
  asSeq,
  type EntityData,
  type SnapshotData,
  type ClientMessage,
  type ServerMessage,
} from '../protocol/protocol.ts'
import {
  BinaryMessageType,
  EntityKindId,
  PickupTypeId,
} from '../protocol/types.ts'
import { BINARY_SPEC } from './spec.ts'
import type { InputMessage } from '../protocol/protocol.ts'

const LE = BINARY_SPEC.LITTLE_ENDIAN

/**
 * Отримання DataView з ArrayBuffer, Buffer або іншого TypedArray
 */
export function toDataView(
  bufferOrView: ArrayBuffer | Uint8Array | DataView,
): DataView {
  if (bufferOrView instanceof DataView) {
    return bufferOrView
  }
  if (bufferOrView instanceof ArrayBuffer) {
    return new DataView(bufferOrView)
  }
  if (ArrayBuffer.isView(bufferOrView)) {
    return new DataView(
      bufferOrView.buffer,
      bufferOrView.byteOffset,
      bufferOrView.byteLength,
    )
  }
  throw new TypeError('Expected ArrayBuffer or TypedArray view')
}

// ==========================================
// 1. INPUT ENCODER & DECODER
// ==========================================

export function encodeInput(input: {
  seq?: number
  tick?: number
  thrust?: number | boolean
  turn?: number
  fire?: boolean
}): ArrayBuffer {
  const buffer = new ArrayBuffer(BINARY_SPEC.INPUT_SIZE)
  const view = new DataView(buffer)

  view.setUint8(0, BinaryMessageType.INPUT)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setUint32(2, (input.seq ?? 0) >>> 0, LE)
  view.setUint32(6, (input.tick ?? 0) >>> 0, LE)

  const thrustFlag = input.thrust ? 1 : 0
  const fireFlag = input.fire ? 2 : 0
  view.setUint8(10, thrustFlag | fireFlag)

  const turn = Number(input.turn) || 0
  const clampedTurn = Math.max(-1, Math.min(1, turn))
  const quantizedTurn = Math.round(
    clampedTurn * BINARY_SPEC.TURN_QUANTIZATION_FACTOR,
  )
  view.setInt16(11, quantizedTurn, LE)

  view.setUint8(13, 0) // reserved
  return buffer
}

export function decodeInput(
  bufferOrView: ArrayBuffer | Uint8Array | DataView,
): InputMessage {
  const view = toDataView(bufferOrView)
  if (
    view.byteLength !== BINARY_SPEC.INPUT_SIZE ||
    view.getUint8(0) !== BinaryMessageType.INPUT ||
    view.getUint8(1) !== BINARY_SPEC.VERSION
  )
    throw new RangeError('Invalid input frame length, type or version')
  if (view.byteLength < BINARY_SPEC.INPUT_SIZE) {
    throw new RangeError(
      `Buffer too small for input message: ${view.byteLength}`,
    )
  }

  const type = view.getUint8(0)
  if (type !== BinaryMessageType.INPUT) {
    throw new Error(`Expected binary input type 1, got ${type}`)
  }

  const version = view.getUint8(1)
  if (version !== BINARY_SPEC.VERSION) {
    throw new Error(`Unsupported binary protocol version: ${version}`)
  }

  const seq = view.getUint32(2, LE)
  const tick = view.getUint32(6, LE)
  const flags = view.getUint8(10)
  const thrust = (flags & 1) !== 0 ? 1 : 0
  const fire = (flags & 2) !== 0
  const quantizedTurn = view.getInt16(11, LE)
  const turn = quantizedTurn / BINARY_SPEC.TURN_QUANTIZATION_FACTOR
  if (Math.abs(turn) > 1 || flags > 3 || view.getUint8(13) !== 0)
    throw new RangeError('Invalid input fields')

  return {
    type: 'input',
    seq: asSeq(seq),
    tick: asTick(tick),
    thrust,
    turn,
    fire,
  }
}

// ==========================================
// 2. SNAPSHOT ENCODER & DECODER
// ==========================================

export function encodeSnapshot(snapshot: {
  tick?: number
  serverTime?: number
  ackSeq?: number
  entities?: readonly EntityData[]
}): ArrayBuffer {
  const entities = snapshot.entities ?? []
  const entityCount = Math.min(entities.length, 65535)
  const totalBytes =
    BINARY_SPEC.SNAPSHOT_HEADER_SIZE +
    entityCount * BINARY_SPEC.ENTITY_RECORD_SIZE

  const buffer = new ArrayBuffer(totalBytes)
  const view = new DataView(buffer)

  // 1. Header (16 bytes)
  view.setUint8(0, BinaryMessageType.SNAPSHOT)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setUint32(2, (snapshot.tick ?? 0) >>> 0, LE)
  view.setUint32(6, (Number(snapshot.serverTime) || Date.now()) >>> 0, LE)
  view.setUint32(10, (snapshot.ackSeq ?? 0) >>> 0, LE)
  view.setUint16(14, entityCount, LE)

  // 2. Entities (24 bytes each)
  let offset = BINARY_SPEC.SNAPSHOT_HEADER_SIZE
  for (let i = 0; i < entityCount; i++) {
    const e = entities[i]
    if (!e) continue

    // [0..1] id (Uint16)
    view.setUint16(offset + 0, (Number(e.id) || 0) & 0xffff, LE)

    // [2] kind (Uint8)
    let kindId = 0
    if (e.kind === 'ship') kindId = EntityKindId.SHIP
    else if (e.kind === 'bullet') kindId = EntityKindId.BULLET
    else if (e.kind === 'asteroid') kindId = EntityKindId.ASTEROID
    else if (e.kind === 'pickup') kindId = EntityKindId.PICKUP
    view.setUint8(offset + 2, kindId)

    // [3] flags
    let flags = 0
    if (e.kind === 'ship') {
      flags = (e.thrust ? 1 : 0) | ((e.shield ?? 0) > 0 ? 2 : 0)
    } else if (e.kind === 'asteroid') {
      flags = e.tier === 1 ? 1 : 2
    } else if (e.kind === 'pickup') {
      flags = PickupTypeId[e.type ?? 'shield']
    } else if (e.kind === 'bullet') {
      flags = e.isHoming ? 1 : 0
    }
    view.setUint8(offset + 3, flags)

    // [4..7] x, [8..11] y (Float32)
    view.setFloat32(offset + 4, Number(e.x) || 0, LE)
    view.setFloat32(offset + 8, Number(e.y) || 0, LE)

    // [12..15] vx, [16..19] vy (Float32)
    view.setFloat32(offset + 12, Number(e.vx) || 0, LE)
    view.setFloat32(offset + 16, Number(e.vy) || 0, LE)

    // [20..21] angle (Int16 quantized)
    let angle = Number(e.angle) || 0
    const tau = Math.PI * 2
    angle = ((angle % tau) + tau) % tau
    if (angle > Math.PI) angle -= tau
    const quantizedAngle = Math.round(
      angle * BINARY_SPEC.ANGLE_QUANTIZATION_FACTOR,
    )
    view.setInt16(offset + 20, quantizedAngle, LE)

    // [22] hp, [23] shield (Uint8)
    view.setUint8(offset + 22, Math.max(0, Math.min(255, Number(e.hp) || 0)))
    view.setUint8(
      offset + 23,
      Math.max(0, Math.min(255, Number(e.shield) || 0)),
    )

    offset += BINARY_SPEC.ENTITY_RECORD_SIZE
  }

  return buffer
}

export function decodeSnapshot(
  bufferOrView: ArrayBuffer | Uint8Array | DataView,
): SnapshotData {
  const view = toDataView(bufferOrView)
  if (
    view.byteLength < BINARY_SPEC.SNAPSHOT_HEADER_SIZE ||
    view.getUint8(0) !== BinaryMessageType.SNAPSHOT ||
    view.getUint8(1) !== BINARY_SPEC.VERSION
  )
    throw new RangeError('Invalid snapshot frame length, type or version')
  if (view.byteLength < BINARY_SPEC.SNAPSHOT_HEADER_SIZE) {
    throw new RangeError(
      `Buffer too small for snapshot header: ${view.byteLength}`,
    )
  }

  const type = view.getUint8(0)
  if (type !== BinaryMessageType.SNAPSHOT) {
    throw new Error(`Expected snapshot type 2, got ${type}`)
  }

  const version = view.getUint8(1)
  if (version !== BINARY_SPEC.VERSION) {
    throw new Error(`Unsupported snapshot version: ${version}`)
  }

  const tick = view.getUint32(2, LE)
  const serverTime = view.getUint32(6, LE)
  const ackSeq = view.getUint32(10, LE)
  const entityCount = view.getUint16(14, LE)

  const expectedBytes =
    BINARY_SPEC.SNAPSHOT_HEADER_SIZE +
    entityCount * BINARY_SPEC.ENTITY_RECORD_SIZE
  if (view.byteLength !== expectedBytes) {
    throw new RangeError(
      `Incomplete snapshot buffer: expected ${expectedBytes}, got ${view.byteLength}`,
    )
  }

  const entities: EntityData[] = []
  let offset = BINARY_SPEC.SNAPSHOT_HEADER_SIZE

  for (let i = 0; i < entityCount; i++) {
    const id = view.getUint16(offset + 0, LE)
    const kindId = view.getUint8(offset + 2)
    const flags = view.getUint8(offset + 3)
    const x = Number(view.getFloat32(offset + 4, LE).toFixed(2))
    const y = Number(view.getFloat32(offset + 8, LE).toFixed(2))
    const vx = Number(view.getFloat32(offset + 12, LE).toFixed(2))
    const vy = Number(view.getFloat32(offset + 16, LE).toFixed(2))
    const quantizedAngle = view.getInt16(offset + 20, LE)
    if (
      Math.abs(quantizedAngle) >
      Math.round(Math.PI * BINARY_SPEC.ANGLE_QUANTIZATION_FACTOR)
    ) {
      throw new RangeError(
        'Snapshot angle is outside the normalized wire range',
      )
    }
    const angle = Number(
      (quantizedAngle / BINARY_SPEC.ANGLE_QUANTIZATION_FACTOR).toFixed(3),
    )
    const hp = view.getUint8(offset + 22)
    const shield = view.getUint8(offset + 23)

    const kind =
      kindId === 1
        ? 'ship'
        : kindId === 2
          ? 'bullet'
          : kindId === 3
            ? 'asteroid'
            : kindId === 4
              ? 'pickup'
              : null
    if (!kind) throw new RangeError('Unknown entity kind')
    if (![x, y, vx, vy, angle].every(Number.isFinite))
      throw new RangeError('Non-finite snapshot coordinate')
    const entity: Record<string, unknown> = {
      id,
      kind,
      x,
      y,
      vx,
      vy,
      angle,
      hp,
      shield,
      alive: hp > 0 || kind !== 'ship',
    }

    if (kind === 'ship') {
      entity.thrust = (flags & 1) !== 0 ? 1 : 0
    } else if (kind === 'asteroid') {
      entity.tier = flags === 1 ? 1 : 2
    } else if (kind === 'pickup') {
      entity.type =
        flags === 1
          ? 'shield'
          : flags === 2
            ? 'rapid'
            : flags === 3
              ? 'homing'
              : flags === 4
                ? 'heal'
                : undefined
    } else if (kind === 'bullet') {
      entity.isHoming = Boolean(flags & 1)
    }

    if (
      (kind === 'ship' && flags > 3) ||
      (kind === 'bullet' && flags > 1) ||
      (kind === 'asteroid' && flags !== 1 && flags !== 2) ||
      (kind === 'pickup' && (flags < 1 || flags > 4))
    )
      throw new RangeError('Invalid entity flags')
    entities.push(EntitySchema.parse(entity))
    offset += BINARY_SPEC.ENTITY_RECORD_SIZE
  }

  return {
    type: 'snapshot',
    tick: asTick(tick),
    serverTime,
    ackSeq: asSeq(ackSeq),
    entities,
  }
}

// ==========================================
// 3. PING & PONG ENCODER & DECODER
// ==========================================

export function encodePing(clientTime: number): ArrayBuffer {
  const buffer = new ArrayBuffer(BINARY_SPEC.PING_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, BinaryMessageType.PING)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setFloat64(2, Number(clientTime) || 0, LE)
  return buffer
}

export function decodePing(bufferOrView: ArrayBuffer | Uint8Array | DataView): {
  type: 'ping'
  clientTime: number
} {
  const view = toDataView(bufferOrView)
  if (
    view.byteLength !== BINARY_SPEC.PING_SIZE ||
    view.getUint8(0) !== BinaryMessageType.PING ||
    view.getUint8(1) !== BINARY_SPEC.VERSION
  )
    throw new RangeError('Invalid ping frame length, type or version')
  if (!Number.isFinite(view.getFloat64(2, LE)))
    throw new RangeError('Invalid ping timestamp')
  return {
    type: 'ping',
    clientTime: view.getFloat64(2, LE),
  }
}

export function encodePong(
  clientTime: number,
  serverTime: number = Date.now(),
): ArrayBuffer {
  const buffer = new ArrayBuffer(BINARY_SPEC.PONG_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, BinaryMessageType.PONG)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setFloat64(2, Number(clientTime) || 0, LE)
  view.setFloat64(10, Number(serverTime) || Date.now(), LE)
  return buffer
}

export function decodePong(bufferOrView: ArrayBuffer | Uint8Array | DataView): {
  type: 'pong'
  clientTime: number
  serverTime: number
} {
  const view = toDataView(bufferOrView)
  if (
    view.byteLength !== BINARY_SPEC.PONG_SIZE ||
    view.getUint8(0) !== BinaryMessageType.PONG ||
    view.getUint8(1) !== BINARY_SPEC.VERSION
  )
    throw new RangeError('Invalid pong frame length, type or version')
  if (![view.getFloat64(2, LE), view.getFloat64(10, LE)].every(Number.isFinite))
    throw new RangeError('Invalid pong timestamp')
  return {
    type: 'pong',
    clientTime: view.getFloat64(2, LE),
    serverTime: view.getFloat64(10, LE),
  }
}

// ==========================================
// 4. CONFIG ENCODER & DECODER
// ==========================================

export function encodeConfig(cfg: {
  latencyMs?: number
  jitterMs?: number
  dropRate?: number
  codec?: string
}): ArrayBuffer {
  const buffer = new ArrayBuffer(BINARY_SPEC.CONFIG_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, BinaryMessageType.CONFIG)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setUint16(2, Math.max(0, Math.min(1000, Number(cfg.latencyMs) || 0)), LE)
  view.setUint8(4, Math.max(0, Math.min(255, Number(cfg.jitterMs) || 0)))
  view.setUint8(
    5,
    Math.max(0, Math.min(100, Math.round((Number(cfg.dropRate) || 0) * 100))),
  )
  view.setUint8(6, cfg.codec === 'json' ? 1 : 0)
  view.setUint8(7, 0)
  return buffer
}

export function decodeConfig(
  bufferOrView: ArrayBuffer | Uint8Array | DataView,
): {
  type: 'config'
  latencyMs: number
  jitterMs: number
  dropRate: number
  codec: 'json' | 'binary'
} {
  const view = toDataView(bufferOrView)
  if (
    view.byteLength !== BINARY_SPEC.CONFIG_SIZE ||
    view.getUint8(0) !== BinaryMessageType.CONFIG ||
    view.getUint8(1) !== BINARY_SPEC.VERSION
  )
    throw new RangeError('Invalid config frame length, type or version')
  const latencyMs = view.getUint16(2, LE)
  const jitterMs = view.getUint8(4)
  const dropRatePercent = view.getUint8(5)
  const codecByte = view.getUint8(6)
  if (
    latencyMs > 1000 ||
    jitterMs > 200 ||
    dropRatePercent > 50 ||
    codecByte > 1 ||
    view.getUint8(7) !== 0
  )
    throw new RangeError('Invalid config fields')
  return {
    type: 'config',
    latencyMs,
    jitterMs,
    dropRate: dropRatePercent / 100,
    codec: codecByte === 1 ? 'json' : 'binary',
  }
}

/**
 * Декодування будь-якого вхідного бінарного фрейму за першим байтом (Type)
 */
export function decodeAnyBinary(
  bufferOrView: ArrayBuffer | Uint8Array | DataView,
): ClientMessage | ServerMessage {
  const view = toDataView(bufferOrView)
  if (view.byteLength < 1) {
    throw new Error('Empty binary frame')
  }

  const type = view.getUint8(0)
  switch (type) {
    case BinaryMessageType.INPUT:
      return decodeInput(view)
    case BinaryMessageType.SNAPSHOT:
      return decodeSnapshot(view)
    case BinaryMessageType.PING:
      return decodePing(view)
    case BinaryMessageType.PONG:
      return decodePong(view)
    case BinaryMessageType.CONFIG:
      return decodeConfig(view)
    default:
      throw new Error(`Unknown binary message type id: ${type}`)
  }
}
