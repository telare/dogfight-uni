import {
  BinaryMessageType,
  EntityKindId,
  EntityKindName,
  PickupTypeId,
  PickupTypeName,
} from '../protocol/types.js'
import { BINARY_SPEC } from './spec.js'

const LE = BINARY_SPEC.LITTLE_ENDIAN

/**
 * Отримання DataView з ArrayBuffer, Buffer або іншого TypedArray
 * @param {ArrayBuffer|Uint8Array|Buffer|DataView} bufferOrView
 * @returns {DataView}
 */
function toDataView(bufferOrView) {
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

export function encodeInput(input) {
  const buffer = new ArrayBuffer(BINARY_SPEC.INPUT_SIZE)
  const view = new DataView(buffer)

  view.setUint8(0, BinaryMessageType.INPUT)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setUint32(2, (input.seq || 0) >>> 0, LE)
  view.setUint32(6, (input.tick || 0) >>> 0, LE)

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

export function decodeInput(bufferOrView) {
  const view = toDataView(bufferOrView)
  if (view.byteLength < BINARY_SPEC.INPUT_SIZE) {
    throw new RangeError(
      `Buffer too small for input message: ${view.byteLength}`,
    )
  }

  const type = view.getUint8(0)
  if (type !== BinaryMessageType.INPUT) {
    throw new Error(`Expected binary input type 1, got ${type}`)
  }

  const seq = view.getUint32(2, LE)
  const tick = view.getUint32(6, LE)
  const flags = view.getUint8(10)
  const thrust = (flags & 1) !== 0 ? 1 : 0
  const fire = (flags & 2) !== 0
  const quantizedTurn = view.getInt16(11, LE)
  const turn = quantizedTurn / BINARY_SPEC.TURN_QUANTIZATION_FACTOR

  return {
    type: 'input',
    seq,
    tick,
    thrust,
    turn,
    fire,
  }
}

// ==========================================
// 2. SNAPSHOT ENCODER & DECODER
// ==========================================

export function encodeSnapshot(snapshot) {
  const entities = snapshot.entities || []
  const entityCount = Math.min(entities.length, 65535)
  const totalBytes =
    BINARY_SPEC.SNAPSHOT_HEADER_SIZE +
    entityCount * BINARY_SPEC.ENTITY_RECORD_SIZE

  const buffer = new ArrayBuffer(totalBytes)
  const view = new DataView(buffer)

  view.setUint8(0, BinaryMessageType.SNAPSHOT)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setUint32(2, (snapshot.tick || 0) >>> 0, LE)
  view.setUint32(6, (snapshot.serverTime || Date.now()) >>> 0, LE)
  view.setUint32(10, (snapshot.ackSeq || 0) >>> 0, LE)
  view.setUint16(14, entityCount, LE)

  let offset = BINARY_SPEC.SNAPSHOT_HEADER_SIZE
  for (let i = 0; i < entityCount; i++) {
    const e = entities[i]
    view.setUint16(offset, (e.id || 0) & 0xffff, LE)

    let kindId = EntityKindId.SHIP
    let flags = 0
    if (e.kind === 'ship') {
      kindId = EntityKindId.SHIP
      if (e.thrust) flags |= 1
      if (e.shield > 0) flags |= 2
    } else if (e.kind === 'bullet') {
      kindId = EntityKindId.BULLET
      if (e.isHoming) flags |= 1
    } else if (e.kind === 'asteroid') {
      kindId = EntityKindId.ASTEROID
      flags = e.tier === 1 ? 1 : 2
    } else if (e.kind === 'pickup') {
      kindId = EntityKindId.PICKUP
      flags = PickupTypeId[e.type] || 1
    }

    view.setUint8(offset + 2, kindId)
    view.setUint8(offset + 3, flags)

    view.setFloat32(offset + 4, Number(e.x) || 0, LE)
    view.setFloat32(offset + 8, Number(e.y) || 0, LE)
    view.setFloat32(offset + 12, Number(e.vx) || 0, LE)
    view.setFloat32(offset + 16, Number(e.vy) || 0, LE)

    const angle = Number(e.angle) || 0
    const quantizedAngle = Math.round(
      angle * BINARY_SPEC.ANGLE_QUANTIZATION_FACTOR,
    )
    view.setInt16(offset + 20, quantizedAngle, LE)

    view.setUint8(
      offset + 22,
      Math.max(0, Math.min(100, Math.round(e.hp || 0))),
    )
    view.setUint8(
      offset + 23,
      Math.max(0, Math.min(100, Math.round(e.shield || 0))),
    )

    offset += BINARY_SPEC.ENTITY_RECORD_SIZE
  }

  return buffer
}

export function decodeSnapshot(bufferOrView) {
  const view = toDataView(bufferOrView)
  if (view.byteLength < BINARY_SPEC.SNAPSHOT_HEADER_SIZE) {
    throw new RangeError(
      `Buffer too small for snapshot header: ${view.byteLength}`,
    )
  }

  const type = view.getUint8(0)
  if (type !== BinaryMessageType.SNAPSHOT) {
    throw new Error(`Expected binary snapshot type 2, got ${type}`)
  }

  const tick = view.getUint32(2, LE)
  const serverTime = view.getUint32(6, LE)
  const ackSeq = view.getUint32(10, LE)
  const entityCount = view.getUint16(14, LE)

  const entities = []
  let offset = BINARY_SPEC.SNAPSHOT_HEADER_SIZE

  for (let i = 0; i < entityCount; i++) {
    if (offset + BINARY_SPEC.ENTITY_RECORD_SIZE > view.byteLength) {
      break
    }

    const id = view.getUint16(offset, LE)
    const kindId = view.getUint8(offset + 2)
    const flags = view.getUint8(offset + 3)
    const x = view.getFloat32(offset + 4, LE)
    const y = view.getFloat32(offset + 8, LE)
    const vx = view.getFloat32(offset + 12, LE)
    const vy = view.getFloat32(offset + 16, LE)
    const quantizedAngle = view.getInt16(offset + 20, LE)
    const angle = quantizedAngle / BINARY_SPEC.ANGLE_QUANTIZATION_FACTOR
    const hp = view.getUint8(offset + 22)
    const shield = view.getUint8(offset + 23)

    const kind = EntityKindName[kindId] || 'entity'
    const entity = {
      id,
      kind,
      x,
      y,
      vx,
      vy,
      angle,
      hp,
      shield,
      alive: true,
    }

    if (kind === 'ship') {
      entity.thrust = (flags & 1) !== 0 ? 1 : 0
    } else if (kind === 'bullet') {
      entity.isHoming = (flags & 1) !== 0
    } else if (kind === 'asteroid') {
      entity.tier = flags === 1 ? 1 : 2
    } else if (kind === 'pickup') {
      entity.type = PickupTypeName[flags] || 'shield'
    }

    entities.push(entity)
    offset += BINARY_SPEC.ENTITY_RECORD_SIZE
  }

  return {
    type: 'snapshot',
    tick,
    serverTime,
    ackSeq,
    entities,
  }
}

// ==========================================
// 3. PING & PONG ENCODERS & DECODERS
// ==========================================

export function encodePing(clientTime) {
  const buffer = new ArrayBuffer(BINARY_SPEC.PING_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, BinaryMessageType.PING)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setFloat64(2, Number(clientTime) || 0, LE)
  return buffer
}

export function decodePing(bufferOrView) {
  const view = toDataView(bufferOrView)
  return {
    type: 'ping',
    clientTime: view.getFloat64(2, LE),
  }
}

export function encodePong(clientTime, serverTime) {
  const buffer = new ArrayBuffer(BINARY_SPEC.PONG_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, BinaryMessageType.PONG)
  view.setUint8(1, BINARY_SPEC.VERSION)
  view.setFloat64(2, Number(clientTime) || 0, LE)
  view.setFloat64(10, Number(serverTime) || Date.now(), LE)
  return buffer
}

export function decodePong(bufferOrView) {
  const view = toDataView(bufferOrView)
  return {
    type: 'pong',
    clientTime: view.getFloat64(2, LE),
    serverTime: view.getFloat64(10, LE),
  }
}

// ==========================================
// 4. CONFIG ENCODER & DECODER
// ==========================================

export function encodeConfig(cfg) {
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

export function decodeConfig(bufferOrView) {
  const view = toDataView(bufferOrView)
  const latencyMs = view.getUint16(2, LE)
  const jitterMs = view.getUint8(4)
  const dropRatePercent = view.getUint8(5)
  const codecByte = view.getUint8(6)
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
export function decodeAnyBinary(bufferOrView) {
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
