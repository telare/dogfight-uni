import { World, Ship, Vector2, encodeSnapshot } from 'shared'
import { decodeReplay } from './replay.ts'

/** Includes packing, startup, copy/transfer, decode and round-trip costs separately. */
export async function runReplayExperiment(frames = 1000, population = 64) {
  const preparationStart = performance.now()
  const world = new World()
  for (let i = 0; i < population; i++)
    world.spawn(
      new Ship({ pos: new Vector2(50 + i * 11, 80 + i * 7), angle: i * 0.1 }),
    )
  const frame = encodeSnapshot(world.getSnapshot())
  const buffer = new ArrayBuffer((frame.byteLength + 4) * frames)
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer)
  for (let i = 0; i < frames; i++) {
    const offset = i * (frame.byteLength + 4)
    view.setUint32(offset, frame.byteLength, true)
    bytes.set(new Uint8Array(frame), offset + 4)
  }
  const byteLength = buffer.byteLength
  const preparationMs = performance.now() - preparationStart
  const syncStart = performance.now()
  const expected = decodeReplay(buffer)
  const syncMs = performance.now() - syncStart
  const worker = new Worker(new URL('./replay.worker.ts', import.meta.url), {
    type: 'module',
  })
  const send = (data: ArrayBuffer, transfer: boolean) =>
    new Promise<{
      result: ReturnType<typeof decodeReplay>
      workerMs: number
      roundTripMs: number
      postMs: number
      detached: boolean
    }>((resolve, reject) => {
      const start = performance.now()
      const timeout = setTimeout(
        () => reject(new Error('Replay worker timed out')),
        30000,
      )
      worker.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Replay worker failed'))
      }
      worker.onmessage = (
        event: MessageEvent<{
          result: ReturnType<typeof decodeReplay>
          workerMs: number
          error?: string
        }>,
      ) => {
        clearTimeout(timeout)
        if (event.data.error) {
          reject(new Error(event.data.error))
          return
        }
        resolve({
          ...event.data,
          roundTripMs: performance.now() - start,
          postMs,
          detached: data.byteLength === 0,
        })
      }
      worker.postMessage(data, transfer ? [data] : [])
      const postMs = performance.now() - start
    })
  try {
    const cold = await send(buffer, false)
    const clone = await send(buffer, false)
    const transfer = await send(buffer, true)
    for (const value of [cold, clone, transfer]) {
      if (JSON.stringify(value.result) !== JSON.stringify(expected))
        throw new Error('Replay worker mismatch')
    }
    return {
      frames,
      population,
      bytes: byteLength,
      preparationMs,
      syncMs,
      cold,
      clone,
      transfer,
      correct: true,
    }
  } finally {
    worker.terminate()
  }
}
