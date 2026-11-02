import fs from 'node:fs/promises'
import os from 'node:os'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

export const output = path.resolve('docs/performance')
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const p = (fraction) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
  return {
    count: sorted.length,
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: sorted.at(-1) ?? 0,
  }
}
export function environment() {
  return {
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: os.totalmem() / 2 ** 30,
  }
}
export async function save(name, data) {
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(
    path.join(output, name),
    name.endsWith('.gz')
      ? gzipSync(JSON.stringify(data))
      : JSON.stringify(data),
  )
}
export async function startServer() {
  const { server, roomManager, wss } = await import('../server/src/index.ts')
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    server,
    roomManager,
    wss,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const socket of wss.clients) socket.terminate()
      await new Promise((resolve) => wss.close(resolve))
      await new Promise((resolve) => server.close(resolve))
      await roomManager.closeAll()
    },
  }
}
export function cpuHotspots(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const totals = new Map()
  profile.samples?.forEach((id, i) => {
    const frame = nodes.get(id)?.callFrame
    const name = `${frame?.functionName || '(anonymous)'} ${frame?.url || ''}:${(frame?.lineNumber ?? -1) + 1}`
    totals.set(
      name,
      (totals.get(name) ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1000,
    )
  })
  return [...totals]
    .map(([name, selfMs]) => ({ name, selfMs }))
    .sort((a, b) => b.selfMs - a.selfMs)
}
export function allocationHotspots(profile) {
  const totals = []
  function visit(node) {
    if (node.selfSize)
      totals.push({
        name: `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url}:${node.callFrame.lineNumber + 1}`,
        bytes: node.selfSize,
      })
    for (const child of node.children ?? []) visit(child)
  }
  visit(profile.head)
  return totals.sort((a, b) => b.bytes - a.bytes)
}

/** SVG sampled flame chart from genuine V8 stacks; open raw profile in DevTools for full zoom. */
export async function flameChart(profile, name, browser) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const parents = new Map()
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id)
  const allSamples = profile.samples ?? [],
    allDeltas = profile.timeDeltas ?? []
  // Show the busiest 250ms window, rather than compressing a minute into unreadable pixels.
  const buckets = new Map()
  let timestamp = 0
  for (let i = 0; i < allSamples.length; i++) {
    const bucket = Math.floor(timestamp / 250000)
    const frame = nodes.get(allSamples[i])?.callFrame
    if (frame?.url && !frame.url.startsWith('node:'))
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + allDeltas[i])
    timestamp += allDeltas[i]
  }
  const best = [...buckets].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const samples = [],
    deltas = []
  timestamp = 0
  for (let i = 0; i < allSamples.length; i++) {
    if (
      Math.floor(timestamp / 250000) === best &&
      !['(idle)', '(program)'].includes(
        nodes.get(allSamples[i])?.callFrame.functionName,
      )
    ) {
      samples.push(allSamples[i])
      deltas.push(allDeltas[i])
    }
    timestamp += allDeltas[i]
  }
  const total = deltas.reduce((a, b) => a + b, 0)
  const width = 1400,
    height = 650,
    bars = []
  const escape = (s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const rows = []
  let elapsed = 0
  for (let i = 0; i < samples.length; i++) {
    const stack = []
    let id = samples[i]
    while (id && stack.length < 100) {
      stack.unshift(nodes.get(id))
      id = parents.get(id)
    }
    let prefix = ''
    for (let depth = 0; depth < Math.min(stack.length, 26); depth++) {
      const label = stack[depth]?.callFrame.functionName || '(anonymous)'
      prefix += '/' + stack[depth]?.id
      rows[depth] ??= []
      const last = rows[depth].at(-1)
      if (last?.prefix === prefix && Math.abs(last.end - elapsed) < 1)
        last.end += deltas[i]
      else
        rows[depth].push({
          prefix,
          label,
          start: elapsed,
          end: elapsed + deltas[i],
        })
    }
    elapsed += deltas[i]
  }
  for (let depth = 0; depth < rows.length; depth++)
    for (const r of rows[depth]) {
      const x = (r.start / total) * width,
        w = Math.max(0.1, ((r.end - r.start) / total) * width),
        y = 70 + depth * 20
      bars.push(
        `<rect x="${x}" y="${y}" width="${w}" height="19" fill="hsl(${(depth * 29 + r.label.length * 7) % 70},80%,65%)"><title>${escape(r.label)}</title></rect>`,
      )
      if (w > 45)
        bars.push(
          `<text x="${x + 2}" y="${y + 13}" font-size="10">${escape(r.label.slice(0, Math.floor(w / 6)))}</text>`,
        )
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="16" y="28" font-size="20">${escape(name)} — V8 sampled stacks</text><text x="16" y="51" font-size="13">Active samples from busiest 250ms slice at ${(best / 4).toFixed(2)}s, ${samples.length} samples; idle/program removed; horizontal = active sampled time, vertical = call depth. Full detail: matching .cpuprofile.</text>${bars.join('')}</svg>`
  await fs.writeFile(path.join(output, `${name}-flame.svg`), svg)
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(svg)
  await page.screenshot({ path: path.join(output, `${name}-flame.png`) })
  await page.close()
}
