/**
 * JSON Codec для порівняння з DataView бінарним протоколом (Lab 05 M4).
 * Використовує JSON.stringify / JSON.parse та TextEncoder / TextDecoder.
 */

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

export function encodeJsonInput(input) {
  const jsonStr = JSON.stringify({
    type: 'input',
    seq: input.seq || 0,
    tick: input.tick || 0,
    thrust: input.thrust ? 1 : 0,
    turn: Number(input.turn) || 0,
    fire: Boolean(input.fire),
  })
  return encoder ? encoder.encode(jsonStr) : Buffer.from(jsonStr, 'utf8')
}

export function decodeJsonInput(raw) {
  const text =
    typeof raw === 'string'
      ? raw
      : decoder
        ? decoder.decode(raw)
        : raw.toString('utf8')
  return JSON.parse(text)
}

export function encodeJsonSnapshot(snapshot) {
  const jsonStr = JSON.stringify({
    type: 'snapshot',
    tick: snapshot.tick || 0,
    serverTime: snapshot.serverTime || Date.now(),
    ackSeq: snapshot.ackSeq || 0,
    entities: (snapshot.entities || []).map((e) => ({
      id: e.id,
      kind: e.kind,
      x: Number(e.x) || 0,
      y: Number(e.y) || 0,
      vx: Number(e.vx) || 0,
      vy: Number(e.vy) || 0,
      angle: Number(e.angle) || 0,
      hp: e.hp || 0,
      shield: e.shield || 0,
      thrust: e.thrust || 0,
      tier: e.tier,
      type: e.type,
      isHoming: e.isHoming ? 1 : 0,
    })),
  })
  return encoder ? encoder.encode(jsonStr) : Buffer.from(jsonStr, 'utf8')
}

export function decodeJsonSnapshot(raw) {
  const text =
    typeof raw === 'string'
      ? raw
      : decoder
        ? decoder.decode(raw)
        : raw.toString('utf8')
  return JSON.parse(text)
}
