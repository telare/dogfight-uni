# Lab 5 — Real-Time Networking: answers

Numbers match the [original questions](questions.md#lab-5--real-time-networking). Project-specific values below were checked against the current implementation during the all-labs audit on 2026-11-03.

## 1. Server authority

**Question:** Why must the server be authoritative? Name the two problems a client-authoritative design has, with a concrete exploit for one of them.

**Answer:**

Client authority creates cheating opportunities and conflicting versions of shared state. A modified client could report teleportation or fabricated hits. An authoritative server accepts inputs, checks their legality, and computes the state everyone uses.

## 2. Prediction and determinism

**Question:** Explain client-side prediction. What property of the simulation does it depend on, and how would you *detect* that property being violated?

**Answer:**

The client immediately simulates its own inputs rather than waiting for a round trip. This requires matching simulation rules, fixed timesteps, initial state, and input order on client and server. Replay identical inputs and compare per-tick states or hashes; use a defined tolerance when comparing quantized snapshot values.

## 3. Reconciliation

**Question:** Walk through reconciliation with a diagram: client at tick 104, snapshot for tick 100 arrives acknowledging `seq` 57, buffer holds `seq` 55–61. What happens, step by step?

**Answer:**

```text
Client: predicted tick 104; input buffer [55, 56, 57, 58, 59, 60, 61]
Server: snapshot tick 100; inputs through seq 57 processed
                         ↓
Restore authoritative player state at tick 100
Discard acknowledged inputs 55–57
Replay inputs 58–61 with their recorded simulation timing
                         ↓
Corrected predicted present; retain 58–61 until acknowledged
```

Replay the simulation steps represented by those inputs, not an assumed one-input-per-tick mapping. Smooth any visible correction separately from the corrected simulation state.

## 4. Interpolation delay

**Question:** Why interpolate remote entities *in the past*? What does the interpolation delay trade off, and what value did you choose?

**Answer:**

Rendering in the past lets two known snapshots bracket the render time despite network jitter. More delay reduces stutter but makes remote entities appear later. This project defaults to **66 ms**, about two 30 Hz snapshot intervals, in [InterpolationManager](../../client/src/net/interpolation.ts). Its buffer uses local arrival times and renders at `performance.now() - interpolationDelayMs`; this is an arrival timeline, not a synchronized server clock. Netgraph shows the delay and enables/disables interpolation, but has no live delay slider. Tune the delay against measured underruns; a value in source is not experimental evidence of an optimal choice.

## 5. Lag compensation

**Question:** What is lag compensation, and why does interpolation make it necessary?

**Answer:**

The server keeps recent history and evaluates a shot against a bounded rewind of target positions corresponding to what the shooter saw. Interpolation adds visual delay beyond network latency, so checking only current positions can reject an apparently correct shot. Bound the rewind to limit unfair hits on targets already behind cover.

## 6. Binary views and endianness

**Question:** `DataView` vs a `Float32Array` view — when is each right? Why does endianness matter for a protocol and not for a local typed array?

**Answer:**

Use `DataView` for mixed fields, arbitrary offsets, and explicit byte order in packets. Use `Float32Array` for dense, aligned float data such as local position buffers. Local typed arrays use the host's byte order consistently; network peers need an agreed order for portable decoding. Sending raw typed-array bytes still requires that agreement.

## 7. Angle precision

**Question:** Your binary snapshot quantizes the angle to `Int16`. What's the precision, and how did you decide it was enough?

**Answer:**

The actual [binary specification](../../shared/src/codec/spec.ts) uses `ANGLE_QUANTIZATION_FACTOR = 1000`: the encoder rounds radians multiplied by 1000 into an `Int16`, and the decoder divides by 1000. The step is **0.001 rad ≈ 0.0573°**, with nearest-rounding error up to **0.0005 rad ≈ 0.02865°** away from normalization seams. For a 50 px heading vector, that error shifts the tip by at most about **0.025 px**, visually negligible at this scale. The format does not spread a full turn over all 65,536 integer values. Round-trip tests use the actual tolerance.

## 8. Server tick scheduling

**Question:** Why not `setInterval` for the server tick? What does the absolute-target scheme fix, and what happens when a tick overruns?

**Answer:**

`setInterval` cannot guarantee timely callbacks. This project's `Match.scheduleNextTick()` advances `nextTickTime` by the fixed interval and uses `setTimeout(..., Math.max(0, nextTickTime - performance.now()))`, so ordinary lateness does not accumulate into a shifted schedule. If a tick overruns, the next callback can run with zero delay until the target catches up. The implementation has no explicit catch-up-count cap or resynchronization policy; those would be improvements, not existing features. No timer recovers CPU time when the server is continuously overloaded.

## 9. Sources of divergence

**Question:** What would break if the sim used `Math.random()`? Iterated a `Set` of entities? Used `Date.now()`?

**Answer:**

`Math.random()` has no shared controllable seed, so use a seeded PRNG with identical call order. A `Set` has deterministic insertion order, but different insertion histories can produce different collision/update outcomes; enforce the same order or sort by stable IDs. `Date.now()` differs across machines and runs; derive simulation time from ticks instead.
