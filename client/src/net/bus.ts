import type { ServerMessage } from 'shared'
export { Bus } from 'shared'
export type GameEvents = { [M in ServerMessage as M['type']]: M } & {
  status: { status: 'disconnected' | 'connecting' | 'connected' }
  reconnectFailed: Record<string, never>
}
