import {
  asEntityId,
  asTick,
  type EntityId,
  type SnapshotData,
  Vector2,
  World,
} from 'shared'
import { Bus, type GameEvents } from './net/bus.ts'

/** Compile-time exercises only: this function is never called by the application. */
export function verifyTypeContracts(snapshot: SnapshotData): void {
  const bus = new Bus<GameEvents>()
  bus.emit('status', { status: 'connected' })
  // @ts-expect-error The event name determines the allowed payload.
  bus.emit('status', { status: 'flying' })
  const id: EntityId = asEntityId(1)
  void id
  // @ts-expect-error A Tick is not an EntityId, even though both are numbers.
  const wrongId: EntityId = asTick(1)
  void wrongId
  // @ts-expect-error Snapshot collections are readonly.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- intentional compile-time rejection
  snapshot.entities.push(snapshot.entities[0])
  // @ts-expect-error Snapshot headers are readonly.
  snapshot.tick = asTick(2)
  const vector = new Vector2(1, 2)
  // @ts-expect-error Vectors expose readonly coordinates.
  vector.x = 3
  const world = new World()
  // @ts-expect-error World lookup requires an EntityId, not a Tick.
  world.get(asTick(1))
  // @ts-expect-error World deletion requires an EntityId, not a raw number.
  world.despawn(1)
  // @ts-expect-error Simulation event names are checked.
  world.emit('firde', {})
  // @ts-expect-error Simulation event payloads depend on the event name.
  world.emit('respawn', { shipId: asTick(1), pos: vector })
}
