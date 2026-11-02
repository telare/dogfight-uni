import { WebSocket } from 'ws'

const [url, room, population] = process.argv.slice(2)
const sockets = []
let bytes = 0,
  measuring = false,
  seq = 0
try {
  await Promise.all(
    Array.from(
      { length: Number(population) },
      (_, i) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(url)
          sockets.push(ws)
          const timer = setTimeout(
            () => reject(new Error('Load join timed out')),
            15000,
          )
          ws.on('error', reject)
          ws.on('open', () =>
            ws.send(JSON.stringify({ type: 'join', room, name: `load-${i}` })),
          )
          ws.on('message', (data, binary) => {
            if (measuring) bytes += data.byteLength
            if (!binary && JSON.parse(data.toString()).type === 'welcome') {
              clearTimeout(timer)
              resolve()
            }
          })
        }),
    ),
  )
  const timer = setInterval(() => {
    seq++
    sockets.forEach((ws, i) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const payload = JSON.stringify({
        type: 'input',
        seq,
        tick: 0,
        thrust: 1,
        turn: Math.sin(seq * 0.05 + i),
        fire: true,
      })
      ws.send(payload)
      if (measuring) bytes += Buffer.byteLength(payload)
    })
  }, 1000 / 30)
  process.on('message', (message) => {
    if (message === 'start') {
      bytes = 0
      measuring = true
    }
    if (message === 'stop') {
      measuring = false
      process.send({
        bytes,
        connected: sockets.filter((ws) => ws.readyState === WebSocket.OPEN)
          .length,
      })
      clearInterval(timer)
      for (const ws of sockets) ws.terminate()
      process.disconnect()
    }
  })
  process.send({ ready: true })
} catch (error) {
  console.error(error)
  for (const ws of sockets) ws.terminate()
  process.exit(1)
}
