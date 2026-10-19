import type { SnapshotData, SnapshotState } from '../protocol/protocol.ts'
import { encodeSnapshot, decodeSnapshot } from './binaryCodec.ts'
import { encodeJsonSnapshot, decodeJsonSnapshot } from './jsonCodec.ts'

export interface Codec {
  encode(snapshot: SnapshotState): ArrayBuffer | Uint8Array
  decode(buffer: ArrayBuffer | Uint8Array): SnapshotData
}

export const binaryCodec: Codec = {
  encode: encodeSnapshot,
  decode: decodeSnapshot,
}
export const jsonCodec: Codec = {
  encode: encodeJsonSnapshot,
  decode: (buffer) =>
    decodeJsonSnapshot(
      buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer,
    ),
}
