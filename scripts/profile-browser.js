import { Match } from '../server/src/match.ts'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import {
  startServer,
  sleep,
  save,
  environment,
  percentiles,
  cpuHotspots,
  allocationHotspots,
  flameChart,
  output,
} from './performance-utils.js'

export async function runBrowser(label = 'after', seconds = 30) {
  const app = await startServer()
  const browser = await chromium.launch({
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  })
  try {
    const room = app.roomManager.getRoom('room-alpha')
    room.match.stop()
    room.match = new Match({ room, seed: 7007 })
    room.match.start()
    room.match.addBots(8)
    for (const bot of room.match.bots.values()) {
      const update = bot.update.bind(bot)
      bot.update = (ship, world) => {
        update(ship, world)
        bot.fire = true
        return bot
      }
    }
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    })
    await page.goto(`${app.base}/?diagnostics=1`)
    await page.locator('[data-room-id="room-alpha"]').click()
    await page.locator('#btn-join').click()
    await page.waitForFunction(
      () =>
        window.__dogfight?.state === 'playing' &&
        window.__dogfight.connection.shipId !== null,
    )
    const pilotId = await page.evaluate(
      () => window.__dogfight.connection.playerId,
    )
    await page.keyboard.down('w')
    await page.keyboard.down('Space')
    await sleep(5000)
    const session = await page.context().newCDPSession(page)
    const trace = []
    session.on('Tracing.dataCollected', ({ value }) => trace.push(...value))
    await session.send('Profiler.enable')
    await session.send('Profiler.start')
    await session.send('Tracing.start', {
      categories: 'devtools.timeline,v8,blink.user_timing',
      options: 'sampling-frequency=1000',
    })
    await page.evaluate(() => {
      window.__perf = { frames: [], spans: {}, running: true }
      let previous = performance.now()
      const frame = (now) => {
        if (!window.__perf.running) return
        window.__perf.frames.push(now - previous)
        previous = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      window.__perf.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          (window.__perf.spans[entry.name] ??= []).push(entry.duration)
      })
      window.__perf.observer.observe({ entryTypes: ['measure'] })
    })
    await sleep(seconds * 1000)
    if (
      (await page.evaluate(() => window.__dogfight.connection.playerId)) !==
      pilotId
    )
      throw new Error('Connection changed during profile')
    const captured = await page.evaluate(() => {
      window.__perf.running = false
      window.__perf.observer.disconnect()
      return {
        frames: window.__perf.frames.slice(1),
        spans: window.__perf.spans,
      }
    })
    const { profile: cpu } = await session.send('Profiler.stop')
    const complete = new Promise((resolve) =>
      session.once('Tracing.tracingComplete', resolve),
    )
    await session.send('Tracing.end')
    await complete
    // Allocation sampling runs separately so it cannot induce GC in the frame/GC window.
    await session.send('HeapProfiler.startSampling', {
      samplingInterval: 16384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    })
    await sleep(5000)
    const { profile: heap } = await session.send('HeapProfiler.stopSampling')
    await save(`browser-${label}.cpuprofile`, cpu)
    await save(`browser-${label}.heapprofile`, heap)
    await save(`browser-${label}-trace.json.gz`, { traceEvents: trace })
    await page.screenshot({
      path: path.join(output, `browser-${label}-game.png`),
    })
    await flameChart(cpu, `browser-${label}`, browser)
    const gc = trace
      .filter((e) => ['MajorGC', 'MinorGC'].includes(e.name) && e.ph === 'X')
      .map((e) => ({
        name: e.name,
        ms: e.dur / 1000,
        reason: e.args?.type,
        heapBefore: e.args?.usedHeapSizeBefore,
        heapAfter: e.args?.usedHeapSizeAfter,
      }))
    const result = {
      environment: {
        ...environment(),
        browser: browser.version(),
        headless: true,
        viewport: '1200x800',
      },
      label,
      seconds,
      bots: 8,
      frame: percentiles(captured.frames),
      spans: Object.fromEntries(
        Object.entries(captured.spans).map(([name, samples]) => [
          name,
          percentiles(samples),
        ]),
      ),
      gc: {
        count: gc.length,
        major: gc.filter((e) => e.name === 'MajorGC').length,
        totalMs: gc.reduce((sum, e) => sum + e.ms, 0),
        entries: gc,
      },
      hotFunctions: cpuHotspots(cpu).slice(0, 15),
      allocators: allocationHotspots(heap).slice(0, 15),
      samples: captured,
    }
    await save(`browser-${label}.json`, result)
    if (label === 'after') {
      const worker = []
      for (let i = 0; i < 5; i++)
        worker.push(
          await page.evaluate(() => window.__dogfight.runReplayExperiment()),
        )
      await save('worker.json', {
        environment: result.environment,
        runs: worker,
      })
    }
    console.log(
      JSON.stringify({
        label,
        frame: result.frame,
        gc: result.gc,
        hotFunctions: result.hotFunctions.slice(0, 3),
        allocators: result.allocators.slice(0, 3),
      }),
    )
    return result
  } finally {
    await browser.close()
    await app.close()
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await runBrowser(
    process.argv[2] ?? 'after',
    Number(process.env.SECONDS ?? 30),
  )
