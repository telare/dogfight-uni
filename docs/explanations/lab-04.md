# Lab 04 — Node, rooms, WebSockets and streams

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-04` (commit `50adb1a`).

```powershell
git checkout lab-04
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. Keep the server terminal running.

- **Say first:** “A separate Node process serves the game and manages shared rooms, connections, chat and logs.”
- **React connection:** the socket wrapper resembles an external service/store. Views subscribe; the service owns connection lifetime and timers.

## Explain in order

1. **HTTP:** static files, room-list/create endpoints and health checks.
2. **WebSocket:** an HTTP upgrade establishes an ongoing bidirectional message connection.
3. **Join:** receive command → validate → find/create room → add player → send welcome/roster.
4. **Rooms:** EventEmitter objects own player Maps and broadcast changes.
5. **Lifecycle:** join timeout, heartbeat, socket error/close handlers and client reconnect/backoff.
6. **Limits:** rate, payload, room/player and outgoing-buffer limits protect the shared process.
7. **Logs:** Transform converts event objects into NDJSON; pipeline writes/streams chunks.
8. **Backpressure:** when `write()` returns false, stop producing until drain; that chunk was already accepted.

```text
browser join → WS validation → Room.join → welcome/roster → client view
room event → NDJSON Transform → file → streamed replay response
```

## Open these files

- [HTTP/lifecycle](../../server/src/index.ts).
- [WebSockets](../../server/src/ws.ts), [rooms](../../server/src/rooms.ts).
- [Match log](../../server/src/log/matchlog.ts), [replay](../../server/src/log/replay.ts).
- [Client connection](../../client/src/net/connection.ts).

## Demonstrate

- Join the same room in two windows; show names and exchanged chat.
- Inspect frames and health; demonstrate the blocking endpoint only in development/staging.
- Use the historical [demo guide](../demo-guides/lab-04.md) for that version's commands.

## Teacher questions

- **Why WebSocket?** Ongoing bidirectional traffic suits frequent input/snapshots.
- **Why can one handler delay every room?** They share one process's JavaScript event loop.
- **Why stream a replay?** Avoid reading the entire large file into memory before sending.
- **Why handle error events?** An unhandled EventEmitter error can terminate Node.
- **Limits to state:** saved replay experiment is 30 MB, not required 200 MB; recording-side producer backpressure remains incomplete. See the audit for heartbeat/protocol deviations.

[Reflection answers](../reflections/lab-04-answers.md) · [Evidence audit](../labs-audit.md#lab-04--nodestreamswebsockets) · [Next lab](lab-05.md)
