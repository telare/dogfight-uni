import { it } from 'node:test'
import assert from 'node:assert/strict'
import { GameConnection } from '../../client/src/net/connection.ts'

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
