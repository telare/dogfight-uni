import { decodeSnapshot } from 'shared'

/** Packed replay: uint32 little-endian frame length, then binary snapshot bytes. */
export function decodeReplay(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  let offset = 0,
    frames = 0,
    entities = 0,
    checksum = 0
  while (offset < buffer.byteLength) {
    if (offset + 4 > buffer.byteLength)
      throw new RangeError('Truncated replay length')
    const size = view.getUint32(offset, true)
    offset += 4
    if (size === 0 || offset + size > buffer.byteLength)
      throw new RangeError('Truncated replay frame')
    const snapshot = decodeSnapshot(new DataView(buffer, offset, size))
    frames++
    entities += snapshot.entities.length
    for (const entity of snapshot.entities) checksum += entity.x + entity.y
    offset += size
  }
  return { frames, entities, checksum }
}
