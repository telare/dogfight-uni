# Lab 05 — authoritative multiplayer and prediction

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-05` (commit `366b6ef`).

```powershell
git checkout lab-05
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. Keep the server terminal running.

- **Say first:** “The server decides the match; the browser predicts local movement so controls feel immediate.”
- **React connection:** prediction resembles optimistic UI, but it runs repeatedly and retains commands for replay.

## Explain in order

1. **Intent:** the client sends thrust/turn/fire with a sequence number, rather than a trusted position.
2. **Prediction:** apply local input immediately using shared movement rules.
3. **Buffer:** retain unacknowledged commands and their simulation timing.
4. **Authority:** server validates input and advances the match at 30 Hz.
5. **Snapshot:** server sends authoritative state and a personalized acknowledgement.
6. **Reconcile:** discard acknowledged commands → restore server state → replay remaining commands.
7. **Smooth:** decay a visual correction offset separately from corrected simulation state.
8. **Remote interpolation:** blend buffered snapshots in the past; actual default delay is 66 ms on the arrival timeline.
9. **Codec:** agree on binary offsets, field sizes, version and little-endian byte order.

```text
Pending: [55,56,57,58,59,60,61]; server acknowledges 57
Discard: [55,56,57]
Restore authoritative state
Replay and retain: [58,59,60,61]
```

## Open these files

- [Connection](../../client/src/net/connection.ts), [prediction](../../client/src/net/prediction.ts), [reconciliation](../../client/src/net/reconcile.ts).
- [Interpolation](../../client/src/net/interpolation.ts), [server Match](../../server/src/match.ts).
- [Binary specification](../../shared/src/codec/spec.ts) and [encoder/decoder](../../shared/src/codec/binaryCodec.ts).

## Demonstrate

- Two windows in one room; move one and observe it from the other.
- Show RTT, pending inputs and correction magnitude in Netgraph.
- Explain JSON versus binary using the saved fixture-specific comparison.

## Teacher questions

- **Why authoritative server?** A modified client must not invent positions/hits.
- **Prediction versus interpolation?** Predict your own present; blend known past states for remote entities.
- **Why not replay acknowledged inputs?** Their effect is already represented by authoritative state.
- **Angle precision?** Factor 1000 gives 0.001 rad steps, not full-Int16 turn scaling.
- **Actual limits:** server coalesces input; live client/server stepping differs. Live delay adjustment and authoritative bullet-ID replacement are incomplete. The GIF is generated artwork, not the required gameplay recording.

[Reflection answers](../reflections/lab-05-answers.md) · [Demo](../demo-guides/lab-05.md) · [Next lab](lab-06.md)
