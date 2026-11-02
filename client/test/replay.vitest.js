import { it, expect } from 'vitest'
import { World, Ship, encodeSnapshot } from 'shared'
import { decodeReplay } from '../src/net/replay.ts'

it('decodes packed replay frames and rejects truncated lengths and payloads', () => {
  const world = new World()
  world.spawn(new Ship())
  const frame = encodeSnapshot(world.getSnapshot())
  const replay = new ArrayBuffer(frame.byteLength + 4)
  new DataView(replay).setUint32(0, frame.byteLength, true)
  new Uint8Array(replay).set(new Uint8Array(frame), 4)
  expect(decodeReplay(replay)).toEqual({ frames: 1, entities: 1, checksum: 0 })
  expect(() => decodeReplay(new ArrayBuffer(2))).toThrow(RangeError)
  expect(() => decodeReplay(replay.slice(0, -1))).toThrow(RangeError)
})
