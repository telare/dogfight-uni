import { performance, PerformanceObserver, constants } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { Match } from '../server/src/match.ts'
import { environment, percentiles, save, sleep } from './performance-utils.js'

export async function runSimulation(label = 'after', seconds = 60) {
  const players = new Map()
  const match = new Match({ seed: 7007, room: { players } })
  match.addBots(8)
  for (const id of match.bots.keys())
    players.set(id, { socket: { readyState: 1, send() {} } })
  // Identical heavy shooting workload in both versions.
  for (const bot of match.bots.values()) {
    const update = bot.update.bind(bot)
    bot.update = (ship, world) => {
      update(ship, world)
      bot.fire = true
      return bot
    }
  }
  for (let i = 0; i < 300; i++) match.tick()
  const gc = []
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      gc.push({
        ms: entry.duration,
        major: (entry.detail.kind & constants.NODE_PERFORMANCE_GC_MAJOR) !== 0,
      })
  })
  observer.observe({ entryTypes: ['gc'] })
  const samples = []
  const end = performance.now() + seconds * 1000
  while (performance.now() < end) {
    const start = performance.now()
    match.tick()
    samples.push(match.tickDurations.at(-1))
    await sleep(Math.max(0, 1000 / 30 - (performance.now() - start)))
  }
  observer.disconnect()
  const result = {
    environment: environment(),
    label,
    seconds,
    bots: 8,
    tick: percentiles(samples),
    samples,
    gc,
  }
  await save(`simulation-${label}.json`, result)
  console.log(JSON.stringify({ label, tick: result.tick, gc: gc.length }))
  return result
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSimulation(
    process.argv[2] ?? 'after',
    Number(process.env.SECONDS ?? 60),
  )
}
