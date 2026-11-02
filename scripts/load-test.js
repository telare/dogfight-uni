import { fork } from 'node:child_process'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  environment,
  percentiles,
  save,
  sleep,
  startServer,
} from './performance-utils.js'

export async function runLoad(counts = [8, 32, 64, 128], seconds = 10) {
  const app = await startServer()
  const results = []
  try {
    for (const count of counts) {
      // Benchmark-only room capacity: production create-room API remains capped at 32.
      const room = app.roomManager.createRoom({
        id: `load-${count}`,
        name: 'Load benchmark',
        maxPlayers: count,
        persistent: true,
      })
      const ticks = []
      let measuring = false
      const tick = room.match.tick.bind(room.match)
      room.match.tick = () => {
        tick()
        if (measuring) ticks.push(room.match.tickDurations.at(-1))
      }
      const client = fork(
        new URL('./load-clients.js', import.meta.url),
        [app.base.replace('http', 'ws') + '/ws', room.id, String(count)],
        { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
      )
      try {
        await Promise.race([
          once(client, 'message'),
          once(client, 'exit').then(() => {
            throw new Error('Load generator exited before ready')
          }),
        ])
        await sleep(3000)
        const start = performance.now(),
          elu = performance.eventLoopUtilization()
        client.send('start')
        measuring = true
        await sleep(seconds * 1000)
        measuring = false
        const intervalElu = performance.eventLoopUtilization(elu).utilization
        const elapsed = (performance.now() - start) / 1000
        const response = once(client, 'message')
        client.send('stop')
        const [traffic] = await response
        results.push({
          clients: count,
          tick: percentiles(ticks),
          tickSamples: ticks,
          eventLoopUtilization: intervalElu,
          rssMB: process.memoryUsage().rss / 2 ** 20,
          bytesPerSecond: traffic.bytes / elapsed,
          connected: traffic.connected,
        })
        console.log(
          JSON.stringify({ ...results.at(-1), tickSamples: undefined }),
        )
      } finally {
        client.kill()
        await sleep(100)
        await room.destroy()
      }
    }
  } finally {
    await app.close()
  }
  const result = {
    environment: environment(),
    seconds,
    results,
    capacityLowerBound:
      results.filter((r) => r.connected === r.clients && r.tick.p99 < 33).at(-1)
        ?.clients ?? 0,
  }
  await save('load.json', result)
  return result
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await runLoad(undefined, Number(process.env.SECONDS ?? 10))
