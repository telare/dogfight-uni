import {
  integrateShipPhysics,
  Vector2,
  wrap,
  type ShipData,
  type ShipInput,
} from 'shared'

export interface PendingCommand {
  seq: number
  input: ShipInput
  dt: number
}

/** Replay movement without emitting shots or mutating either input. */
export function reconcileState(
  authoritative: ShipData,
  commands: readonly PendingCommand[],
  ack: number,
  width: number,
  height: number,
) {
  let state = {
    pos: new Vector2(authoritative.x, authoritative.y),
    vel: new Vector2(authoritative.vx, authoritative.vy),
    angle: authoritative.angle,
  }
  for (const command of commands) {
    if (command.seq <= ack) continue
    state = integrateShipPhysics(state, command.input, command.dt)
    wrap(state, width, height)
  }
  return state
}
