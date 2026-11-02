import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { runBrowser } from './profile-browser.js'
import { output, save, cpuHotspots, flameChart } from './performance-utils.js'

const label = process.argv[2] ?? 'after'
await fs.mkdir(output, { recursive: true })
// CPU profiler is enabled on the actual Node process executing the match.
await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [
      '--cpu-prof',
      `--cpu-prof-dir=${output}`,
      `--cpu-prof-name=server-${label}.cpuprofile`,
      '--import',
      'tsx',
      'scripts/profile-simulation.js',
      label,
    ],
    { stdio: 'inherit' },
  )
  child.on('error', reject)
  child.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`Simulation exited ${code}`)),
  )
})
const cpu = JSON.parse(
  await fs.readFile(path.join(output, `server-${label}.cpuprofile`), 'utf8'),
)
await save(`server-${label}-hotspots.json`, cpuHotspots(cpu).slice(0, 20))
const browser = await chromium.launch()
try {
  await flameChart(cpu, `server-${label}`, browser)
} finally {
  await browser.close()
}
await runBrowser(label)
if (label === 'after')
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/load-test.js'],
      { stdio: 'inherit' },
    )
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Load test exited ${code}`)),
    )
  })
