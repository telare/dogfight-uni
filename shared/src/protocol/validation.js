import { ClientMessageType, CloseCode } from './types.js'

/**
 * Валідація ігрового вводу (Input frame)
 * @param {Object} input
 * @returns {{ valid: boolean, reason?: string, sanitized?: Object }}
 */
export function validateInput(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, reason: 'Input must be an object' }
  }

  const seq = Number.isInteger(input.seq) && input.seq >= 0 ? input.seq : 0
  const tick = Number.isInteger(input.tick) && input.tick >= 0 ? input.tick : 0

  let turn = Number(input.turn)
  if (Number.isNaN(turn) || !Number.isFinite(turn)) {
    turn = 0
  }
  turn = Math.max(-1, Math.min(1, turn))

  let thrust = Number(input.thrust)
  if (Number.isNaN(thrust) || !Number.isFinite(thrust)) {
    thrust = 0
  }
  thrust = Math.max(0, Math.min(1, thrust))

  const fire = Boolean(input.fire)

  return {
    valid: true,
    sanitized: { seq, tick, turn, thrust, fire },
  }
}

/**
 * Валідація сирого текстового / JSON повідомлення від клієнта
 * @param {string|Buffer} rawData
 * @param {number} [maxBytes=32768]
 * @returns {{ valid: boolean, msg?: Object, code?: number, reason?: string }}
 */
export function validateClientJsonMessage(rawData, maxBytes = 32768) {
  let text = ''
  let byteLength = 0

  if (typeof rawData === 'string') {
    text = rawData
    byteLength =
      typeof Buffer !== 'undefined' ? Buffer.byteLength(rawData) : text.length
  } else if (
    rawData instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawData))
  ) {
    byteLength = rawData.byteLength || rawData.length
    if (typeof TextDecoder !== 'undefined') {
      text = new TextDecoder().decode(rawData)
    } else {
      text = rawData.toString('utf8')
    }
  } else {
    return {
      valid: false,
      code: CloseCode.PROTOCOL_ERROR,
      reason: 'Unsupported payload type',
    }
  }

  if (byteLength > maxBytes) {
    return {
      valid: false,
      code: CloseCode.MESSAGE_TOO_BIG,
      reason: `Message size ${byteLength} exceeds maximum payload ${maxBytes}`,
    }
  }

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return {
      valid: false,
      code: CloseCode.PROTOCOL_ERROR,
      reason: `Invalid JSON syntax: ${err.message}`,
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      code: CloseCode.PROTOCOL_ERROR,
      reason: 'Root message must be a JSON object',
    }
  }

  const { type } = parsed
  if (!type || typeof type !== 'string') {
    return {
      valid: false,
      code: CloseCode.PROTOCOL_ERROR,
      reason: "Missing or invalid 'type' property",
    }
  }

  switch (type) {
    case ClientMessageType.JOIN: {
      if (!parsed.room || typeof parsed.room !== 'string') {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: "Join message requires 'room' string",
        }
      }
      return {
        valid: true,
        msg: {
          type: ClientMessageType.JOIN,
          room: parsed.room.trim().slice(0, 64),
          name: (parsed.name || 'Pilot').toString().trim().slice(0, 32),
        },
      }
    }

    case ClientMessageType.LEAVE:
      return { valid: true, msg: { type: ClientMessageType.LEAVE } }

    case ClientMessageType.INPUT: {
      const v = validateInput(parsed)
      if (!v.valid) {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: v.reason,
        }
      }
      return {
        valid: true,
        msg: {
          type: ClientMessageType.INPUT,
          ...v.sanitized,
        },
      }
    }

    case ClientMessageType.CHAT: {
      const chatText = (parsed.text || '').toString().trim().slice(0, 160)
      if (!chatText) {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: 'Chat message text cannot be empty',
        }
      }
      return {
        valid: true,
        msg: {
          type: ClientMessageType.CHAT,
          text: chatText,
        },
      }
    }

    case ClientMessageType.PING: {
      return {
        valid: true,
        msg: {
          type: ClientMessageType.PING,
          clientTime: Number(parsed.clientTime) || Date.now(),
        },
      }
    }

    case ClientMessageType.CONFIG: {
      return {
        valid: true,
        msg: {
          type: ClientMessageType.CONFIG,
          latencyMs: Math.max(0, Math.min(1000, Number(parsed.latencyMs) || 0)),
          jitterMs: Math.max(0, Math.min(200, Number(parsed.jitterMs) || 0)),
          dropRate: Math.max(0, Math.min(0.5, Number(parsed.dropRate) || 0)),
          codec: parsed.codec === 'json' ? 'json' : 'binary',
        },
      }
    }

    default:
      return {
        valid: false,
        code: CloseCode.PROTOCOL_ERROR,
        reason: `Unknown message type: '${type}'`,
      }
  }
}
