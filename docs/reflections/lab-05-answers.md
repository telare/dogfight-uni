# Lab 5 — Real-Time Networking: answers

Numbers match the [original questions](questions.md#lab-5--real-time-networking). Suggested values and encoding assumptions below are examples, not measurements of your implementation.

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

Rendering slightly behind the latest server time lets two known snapshots bracket the render time despite network jitter. More delay reduces stutter but makes remote entities appear later. **Example choice:** 100 ms, around three snapshot intervals at 30 Hz; tune using measured jitter and buffer underruns rather than treating it as universal.

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

Assuming a full turn maps across approximately 65,536 signed values, the step is `360 / 65536 ≈ 0.00549°` (`0.0000959` radians). Rounding gives roughly half a step of maximum error; a 50 px heading vector shifts about 0.0024 px. That is visually negligible. If the encoder uses another scale, calculate precision from that actual scale.

## 8. Server tick scheduling

**Question:** Why not `setInterval` for the server tick? What does the absolute-target scheme fix, and what happens when a tick overruns?

**Answer:**

`setInterval` is not synchronized to simulation deadlines and cannot guarantee timely callbacks. An absolute-target loop computes `target = start + tickIndex * dt`, preventing callback lateness from accumulating into schedule drift. After an overrun, run bounded catch-up steps or apply a documented resynchronization policy. No timer can recover CPU time when the server is continuously overloaded.

## 9. Sources of divergence

**Question:** What would break if the sim used `Math.random()`? Iterated a `Set` of entities? Used `Date.now()`?

**Answer:**

`Math.random()` has no shared controllable seed, so use a seeded PRNG with identical call order. A `Set` has deterministic insertion order, but different insertion histories can produce different collision/update outcomes; enforce the same order or sort by stable IDs. `Date.now()` differs across machines and runs; derive simulation time from ticks instead.
