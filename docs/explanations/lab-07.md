# Lab 07 — tests, profiles and measured optimization

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-07` (commit `fb61a24`).
- `lab-07` is published on the remote.

```powershell
git checkout lab-07
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. Keep the server terminal running.

- **Say first:** “Tests establish behavior; profiles identify expensive work; measurements assess the changes.”
- **React connection:** similar to profiling a React UI, but the measured work includes simulation, Canvas, codecs, garbage collection and server traffic.

## Explain in order

1. **Example tests:** assert known outcomes for specific inputs.
2. **Property tests:** generate inputs and check invariants, such as codec round trips within tolerance.
3. **Fake timers:** test scheduling rules without waiting for wall-clock time.
4. **E2E:** two real browser contexts verify roster, remote movement and chat.
5. **Profile:** collect timing spans, CPU samples and allocation samples.
6. **Optimize:** address observed costs, then run regression tests and repeat measurements.
7. **Worker:** move replay decoding off the main thread; compare startup/messaging versus responsiveness.
8. **Load:** use a separate client process and measure tick duration, ELU, RSS and payload traffic.

## Open these files

- [Properties](../../shared/test/lab07.vitest.js), [server tests](../../server/test/lab07.vitest.js).
- [Two-browser test](../../client/e2e/multiplayer.spec.js).
- [Measured report](../lab-07.report.md) and [raw profiles](../performance/).

## Explain these actual changes

- Cache repeated star-color strings.
- Reuse interpolation render records.
- Update Netgraph DOM at 10 Hz rather than every rendered frame.
- Encode entity data once per server tick; keep independent recipient buffers for acknowledgements.
- Pooling trades fewer allocations for retained memory, reset work and stale-reference risk.

## Results to state accurately

- Audit run: 106 tests; four browser tests; shared line coverage 93.63%.
- Historical browser frame p99: 16.8 ms; major GC count: 39 → 20, not zero.
- Lab 07 loopback load passed through 128 clients; exact saturation was not found.
- Lab 08's one-CPU container load is a different experiment.

## Teacher questions

- **What is p99?** A high percentile of sampled durations, not an average or guaranteed maximum.
- **Why transfer a buffer?** Avoid copying its contents; sender ownership is detached.
- **Why not optimize everything?** Extra complexity needs measured benefit.
- **Budgets?** About 16.67 ms per 60 Hz frame; 33.33 ms per 30 Hz server tick. Neither is RTT.

[Reflection answers](../reflections/lab-07-answers.md) · [Demo](../demo-guides/lab-07.md) · [Next lab](lab-08.md)
