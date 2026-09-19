/**
 * Dogfight Server — Протокол обміну повідомленнями WebSocket (Lab 04)
 * Версія 1.0. Строга валідація форми та розміру клієнтських повідомлень на сервері.
 */

export const PROTOCOL_VERSION = 1

export const ClientMessageType = {
  JOIN: 'join',
  LEAVE: 'leave',
  CHAT: 'chat',
  PING: 'ping',
}

export const ServerMessageType = {
  WELCOME: 'welcome',
  ROSTER: 'roster',
  CHAT: 'chat',
  JOINED: 'joined',
  LEFT: 'left',
  ERROR: 'error',
  PONG: 'pong',
}

export const CloseCode = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
}

/**
 * Валідація сирого вхідного повідомлення від клієнта
 * @param {string|Buffer} rawData
 * @param {number} [maxBytes=32768]
 * @returns {{ valid: boolean, msg?: Object, code?: number, reason?: string }}
 */
export function validateClientMessage(rawData, maxBytes = 32768) {
  const byteLength = Buffer.isBuffer(rawData)
    ? rawData.length
    : Buffer.byteLength(rawData || '')

  if (byteLength > maxBytes) {
    return {
      valid: false,
      code: CloseCode.MESSAGE_TOO_BIG,
      reason: `Message size ${byteLength} exceeds maximum payload ${maxBytes}`,
    }
  }

  let text = ''
  if (Buffer.isBuffer(rawData)) {
    text = rawData.toString('utf8')
  } else if (typeof rawData === 'string') {
    text = rawData
  } else {
    return {
      valid: false,
      code: CloseCode.PROTOCOL_ERROR,
      reason: 'Unsupported binary frame payload format',
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
      reason: 'Root message payload must be a JSON object',
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
      const room = parsed.room.trim()
      const name =
        typeof parsed.name === 'string'
          ? parsed.name.trim().slice(0, 24)
          : 'Pilot'
      if (!room || room.length > 32) {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: 'Invalid room id length',
        }
      }
      return {
        valid: true,
        msg: { type: ClientMessageType.JOIN, room, name },
      }
    }

    case ClientMessageType.CHAT: {
      if (typeof parsed.text !== 'string') {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: "Chat message requires 'text' string",
        }
      }
      const textVal = parsed.text.trim().slice(0, 200)
      if (!textVal) {
        return {
          valid: false,
          code: CloseCode.PROTOCOL_ERROR,
          reason: 'Chat message text cannot be empty',
        }
      }
      return {
        valid: true,
        msg: { type: ClientMessageType.CHAT, text: textVal },
      }
    }

    case ClientMessageType.LEAVE:
      return { valid: true, msg: { type: ClientMessageType.LEAVE } }

    case ClientMessageType.PING:
      return { valid: true, msg: { type: ClientMessageType.PING } }

    default:
      return {
        valid: false,
        code: CloseCode.PROTOCOL_ERROR,
        reason: `Unknown message type: ${type}`,
      }
  }
}
