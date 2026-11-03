import { performance } from 'node:perf_hooks'
import type { WebSocket } from 'ws'
import type { RoomManager } from './rooms.ts'
import { logger } from './logger.ts'

export const metrics = {
  messagesIn: 0,
  messagesOut: 0,
  bytesIn: 0,
  bytesOut: 0,
  rejected: {
    origin: 0,
    ip_limit: 0,
    draining: 0,
    protocol: 0,
    rate: 0,
    join_timeout: 0,
    heartbeat: 0,
    slow_client: 0,
    capacity: 0,
    payload: 0,
  },
}
export function reject(
  reason: keyof typeof metrics.rejected,
  playerId?: string,
) {
  metrics.rejected[reason]++
  logger.warn({ event: 'ws.rejected', reason, playerId })
}
export function sendMeasured(
  socket: WebSocket,
  data: string | ArrayBuffer | Uint8Array,
  options?: { binary?: boolean },
) {
  if (socket.readyState !== 1) return
  metrics.messagesOut++
  metrics.bytesOut +=
    typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
  socket.send(data, options ?? {})
}
let previousElu = performance.eventLoopUtilization()
let previousAt = performance.now()
let previous = { ...metrics }
export function renderMetrics(manager: RoomManager) {
  const rooms = manager.listRooms()
  const now = performance.now()
  const seconds = Math.max((now - previousAt) / 1000, 0.001)
  const elu = performance.eventLoopUtilization(previousElu)
  previousElu = performance.eventLoopUtilization()
  const values: Record<string, number> = {
    players: rooms.reduce((sum, room) => sum + room.players, 0),
    rooms: rooms.length,
    rss_bytes: process.memoryUsage().rss,
    event_loop_utilization: elu.utilization,
  }
  for (const key of [
    'messagesIn',
    'messagesOut',
    'bytesIn',
    'bytesOut',
  ] as const) {
    values[`${key}_per_second`] = (metrics[key] - previous[key]) / seconds
  }
  previous = { ...metrics }
  previousAt = now
  const lines = Object.entries(values).flatMap(([key, value]) => [
    `# TYPE dogfight_${key} gauge`,
    `dogfight_${key} ${value}`,
  ])
  for (const key of [
    'messagesIn',
    'messagesOut',
    'bytesIn',
    'bytesOut',
  ] as const) {
    lines.push(
      `# TYPE dogfight_${key}_total counter`,
      `dogfight_${key}_total ${metrics[key]}`,
    )
  }
  lines.push('# TYPE dogfight_rejections_total counter')
  for (const [reason, count] of Object.entries(metrics.rejected))
    lines.push(`dogfight_rejections_total{reason="${reason}"} ${count}`)
  // Each room retains its most recent 60 ticks (~2 seconds at 30 Hz).
  lines.push('# TYPE dogfight_tick_p99_ms gauge')
  for (const room of rooms) {
    const ticks =
      manager
        .getRoom(room.id)
        ?.match.tickDurations.slice()
        .sort((a, b) => a - b) ?? []
    // Index avoids unbounded, user-controlled room identifiers in labels.
    lines.push(
      `dogfight_tick_p99_ms{slot="${rooms.indexOf(room)}"} ${ticks[Math.max(0, Math.ceil(ticks.length * 0.99) - 1)] ?? 0}`,
    )
  }
  return lines.join('\n') + '\n'
}
