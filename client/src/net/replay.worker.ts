import { decodeReplay } from './replay.ts'

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const start = performance.now()
    const result = decodeReplay(event.data)
    self.postMessage({ result, workerMs: performance.now() - start })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Replay decode failed',
    })
  }
}
