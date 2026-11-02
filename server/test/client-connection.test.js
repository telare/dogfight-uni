import { it, vi } from 'vitest'
import assert from 'node:assert/strict'
import { GameConnection } from '../../client/src/net/connection.ts'

it('ignores close events from replaced sockets instead of reconnecting', () => {
  vi.useFakeTimers()
  const sockets = []
  class Socket {
    static OPEN = 1
    readyState = 1
    constructor() {
      sockets.push(this)
    }
    send() {}
    close() {
      this.readyState = 3
    }
  }
  vi.stubGlobal('WebSocket', Socket)
  const connection = new GameConnection()
  try {
    connection.connect('room-alpha')
    connection.connect('room-alpha')
    sockets[1].onopen()
    sockets[0].onclose({ code: 1000, reason: 'Player left' })
    vi.advanceTimersByTime(1500)
    assert.equal(sockets.length, 2)
    assert.equal(connection.status, 'connected')
  } finally {
    connection.disconnect()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  }
})

it('browser client closes malformed server payloads with an allowed application code', () => {
  const original = globalThis.WebSocket
  let socket
  class BrowserSocket {
    static OPEN = 1
    readyState = 1
    closed = null
    constructor() {
      socket = this
    }
    send() {}
    close(code = 1000) {
      if (code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException(
          'Invalid browser close code',
          'InvalidAccessError',
        )
      }
      this.closed = code
      this.readyState = 3
    }
  }
  globalThis.WebSocket = BrowserSocket
  try {
    for (const payload of [
      '{',
      'null',
      'false',
      '{"type":"unknown"}',
      '{"type":"welcome","shipId":"invalid"}',
      new ArrayBuffer(2),
    ]) {
      const connection = new GameConnection()
      try {
        connection.connect('room-alpha')
        assert.doesNotThrow(() => socket.onmessage({ data: payload }))
        assert.equal(socket.closed, 4002)
      } finally {
        connection.disconnect()
      }
    }
  } finally {
    globalThis.WebSocket = original
  }
})
