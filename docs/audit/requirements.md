# Audited assignment requirements

Snapshot taken from the local official course briefs on 2026-11-03. Original checklist order is retained. Milestone-only requirements are additionally covered in the audit. Optional Stretch sections are excluded.

## Lab 01

Source: `lab-01-event-loop-and-game-loop.md`. SHA-256: `d33f9edcf36d4878e0a549f0705d7bdd72f010bc2f3a802cce8fb18e663fc362`.

### Deliverables

- [ ] Vite project, `"type": "module"`, ESLint/Prettier or Biome, `.nvmrc`.
- [ ] `createLoop` with rAF + clamped accumulator; exposes steps/s, frames/s, frame time; HUD shows them.
- [ ] `createInput` closure with `isDown` and `justPressed`.
- [ ] Pure `integrate(ship, input, dt)`; arena wrap-around; no DOM in `sim/`.
- [ ] Interpolated rendering with correct angle lerp; DPR-aware, resizable canvas.
- [ ] Experiments 1–3 documented with numbers/screenshots and event-loop explanations.
- [ ] Git tag `lab-01`.

### Reflections

1. Draw the runtime: call stack, heap, Web APIs, task queue, microtask queue, render steps. Trace `setTimeout(f, 0); Promise.resolve().then(g);` through it.
2. Why does a 100 ms synchronous loop freeze the whole page, including CSS animations and scrolling in many cases? What *can't* JavaScript do about it from the same thread?
3. Microtasks vs tasks: state the rule for when each runs. Why can a microtask chain starve rendering while a `setTimeout` chain can't?
4. Where does `requestAnimationFrame` run relative to tasks, microtasks, and paint? Why is it better than `setInterval(fn, 16)` for animation — give three reasons.
5. Explain the accumulator loop. Why clamp the frame delta? What is `alpha` and what does the renderer do with it?
6. Why must the simulation be deterministic, and what does that have to do with multiplayer (Lab 5)?
7. What does a closure capture — values or variables? Show the `var`/`let` loop difference and explain it precisely.
8. What changes when you add `type="module"` to a script tag? Name five things.

## Lab 02

Source: `lab-02-objects-prototypes-classes.md`. SHA-256: `f4b26361f2e0a06c575f0f13f20c4dd41bad1c016c5d116a2513576100ad166d`.

### Deliverables

- [ ] `Vector2` with pure methods; `Entity` base with private static id counter; `Ship extends Entity` (one level).
- [ ] `World` over `Map`, iterable via `[Symbol.iterator]`, `*ofKind`, deferred despawn sweep.
- [ ] `Bullet` (TTL), `Asteroid`, `Explosion` (particles), `Pickup`; `Ship.fire()`.
- [ ] The `this` bug documented with the fix chosen and alternatives listed.
- [ ] Circle collision system as a swappable function; damage via `#hp`; respawn; score HUD.
- [ ] Homing and pickups via composition; ≤ 1-page design write-up (why not a deep `extends` tree).
- [ ] Git tag `lab-02`.

### Reflections

Defense: pick 2–3 from the first four. The rest is extra.

1. State the four `this` rules in precedence order. What's `this` in `setTimeout(ship.fire, 100)`? Give three fixes and one downside of each.
2. Why do arrow functions ignore `.bind`? What are they good for, and where are they the wrong choice for a method shared by many instances?
3. Why `Map` over a plain object for the entity store? Give three concrete reasons.
4. Argue for composition over inheritance using your homing-bullet-and-homing-asteroid case. What would the hierarchy have had to look like?

Optional, if you went into Stretch:

5. Draw the prototype chain for `const s = new Ship()` where `class Ship extends Entity`. What does `s.update` do, step by step?
6. What exactly does `new` do? Write `new` as a function using `Object.create` and `.call`.
7. Why do people say `class` is "just sugar"? Name three things `class` does that the constructor-function version doesn't.
8. What is an iterable? Why could `[...world]` be a problem in a game loop?

## Lab 03

Source: `lab-03-async-javascript.md`. SHA-256: `b564f75e1575c67f7c81f8cd56e6ab90c3d0743e4e9906a02a189696856f7ef8`.

### Deliverables

- [ ] `loadImage` / `loadAudio` / `loadJson` with `AbortSignal` support; `fetchJson` checks `ok`; `withRetry` with backoff + jitter, no retry on 4xx.
- [ ] `loadAll` via `Promise.all` with per-item progress; loading screen with a real bar; sequential-vs-concurrent timing in README.
- [ ] Sprite rendering from sheets; Web Audio module unlocked by user gesture; decoded during loading.
- [ ] `EventTarget`/`CustomEvent` bus; sim has zero imports of audio/HUD.
- [ ] Lobby (`extends EventTarget`) with periodic refresh, `AbortSignal.timeout`, abort-on-leave; rendering in a separate module.
- [ ] Five self-written ordering puzzles with explanations; failure gallery (404, timeout, abort, bad JSON).
- [ ] Git tag `lab-03`.

### Reflections

1. The three promise states and the transitions. Why does `.then` on an already-fulfilled promise still run asynchronously, and as which kind of task?
2. Desugar `async function f() { const a = await g(); return a + 1; }` into `.then` calls. Where exactly does the function return control to the event loop?
3. Predict: `setTimeout(log1); Promise.resolve().then(log2).then(log3); (async () => { log4; await 0; log5 })(); log6`. Explain every position.
4. `Promise.all` vs `allSettled` vs `race` vs `any` — one use case each from your game. What happens to the *other* promises when `all` rejects?
5. Why doesn't `fetch` reject on a 404? What's the two-step nature of reading a response, and why?
6. How does `AbortController` implement cancellation without the promise having a cancel method? How do you make *your own* async function cancellable?
7. Promise vs event: when is each the right tool? Show converting one into the other.
8. What happens to an unhandled rejection in the browser? In Node? Why is that difference deliberate?

## Lab 04

Source: `lab-04-node-streams-websockets.md`. SHA-256: `cd5a8a72808942c5a738e9ec81cf0dbd7225b24ff961a4c5096a317a467f029c`.

### Deliverables

- [ ] npm workspaces: `client/`, `server/`; `"type": "module"`; `node:`-prefixed built-ins.
- [ ] `node:http` static serving (MIME, traversal guard), `GET/POST /api/rooms`, `GET /health`; Vite proxy in dev.
- [ ] `config.js` from env with validation; `--env-file`; graceful `SIGTERM` shutdown.
- [ ] `Room extends EventEmitter`; `RoomManager`; roster/chat broadcast; join timeout.
- [ ] `protocol.js` with versioned, validated JSON messages; unknown/oversize → close with code.
- [ ] Heartbeat ping/pong; `"error"` listener on every socket; client reconnect with backoff + send queue.
- [ ] Object-mode `Transform` → NDJSON via `pipeline`; streaming replay endpoint; `rss`-over-time graph under throttled download.
- [ ] Token-bucket rate limit, `maxPayload`, room/player caps, `bufferedAmount` slow-client policy.
- [ ] Event-loop + backpressure write-up with the blocking demonstration and the crash-and-fix excerpt.
- [ ] Git tag `lab-04`.

### Reflections

1. Draw the Node event loop phases. Where do `setTimeout`, `setImmediate`, `process.nextTick`, and promise reactions run? Why is `setTimeout(0)` vs `setImmediate` order unstable from the main module?
2. Node is single-threaded — so how does it read a file without blocking? What does libuv's thread pool handle, and what does it not?
3. CommonJS vs ESM: three differences. What is `import.meta.dirname` replacing?
4. What is backpressure? Show what `write()` returning `false` means and what happens if you ignore it. How does `pipeline` handle it?
5. What's the difference between a Readable, Writable, Duplex, and Transform? Which one is a TCP socket?
6. Walk through the WebSocket handshake. Why does a game use WebSockets rather than polling or SSE?
7. Why must every `EventEmitter` that can fail have an `"error"` listener? What happens otherwise, and what's the equivalent failure for promises in Node?
8. A client is on a 2G connection and your server sends 30 snapshots/s. What happens in the server's memory, how do you detect it, and what are your options?
9. Why validate every incoming message's shape on the server even though you wrote the client?

## Lab 05

Source: `lab-05-realtime-networking.md`. SHA-256: `33cf10477075d599c50e2adfe76070d766df34b4cdf3fa51113a27086ca15f44`.

### Deliverables

- [ ] `shared/` workspace: sim, seeded PRNG, protocol, codec; imports cleanly in Node and browser; determinism test (same inputs → same hash on both).
- [ ] Server `Match` at 30 Hz with absolute-target timer; tick duration/jitter in `/api/stats`; input validation and rate limiting.
- [ ] Inputs carry `seq`; snapshots carry `tick` and `lastProcessedSeq`.
- [ ] Prediction, reconciliation with input replay, correction smoothing; determinism-break experiment documented.
- [ ] Interpolation buffer with adjustable delay; entity appear/disappear handled; local bullet prediction.
- [ ] Latency/jitter/drop injector; netgraph overlay.
- [ ] `DataView` codec per written spec; round-trip tests; JSON vs binary table.
- [ ] Two-player side-by-side GIF; one-page netcode write-up.
- [ ] Git tag `lab-05`.

### Reflections

1. Why must the server be authoritative? Name the two problems a client-authoritative design has, with a concrete exploit for one of them.
2. Explain client-side prediction. What property of the simulation does it depend on, and how would you *detect* that property being violated?
3. Walk through reconciliation with a diagram: client at tick 104, snapshot for tick 100 arrives acknowledging `seq` 57, buffer holds `seq` 55–61. What happens, step by step?
4. Why interpolate remote entities *in the past*? What does the interpolation delay trade off, and what value did you choose?
5. What is lag compensation, and why does interpolation make it necessary?
6. `DataView` vs a `Float32Array` view — when is each right? Why does endianness matter for a protocol and not for a local typed array?
7. Your binary snapshot quantizes the angle to `Int16`. What's the precision, and how did you decide it was enough?
8. Why not `setInterval` for the server tick? What does the absolute-target scheme fix, and what happens when a tick overruns?
9. What would break if the sim used `Math.random()`? Iterated a `Set` of entities? Used `Date.now()`?

## Lab 06

Source: `lab-06-typescript.md`. SHA-256: `a270621ed72318f9a9e3df586339930c2d0a2dbedb65b27f573bf1331ba12899`.

### Deliverables

- [ ] Root + per-package `tsconfig`; `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; `npm run typecheck` at root; CI runs it.
- [ ] `shared/` fully typed: `readonly Vector2`, discriminated entity kinds, branded `EntityId`/`Tick`/`Seq`.
- [ ] `protocol.ts`: zod schemas, inferred types, `parseClientMessage` returning a result; hand validator deleted.
- [ ] Binary codec typed with range/version checks; `Codec` interface with JSON and binary implementations.
- [ ] Exhaustive `switch` + `never` on every `type`/`kind` dispatch.
- [ ] Typed events (`Room`, client `Bus<GameEvents>`); zod-validated `ServerConfig`; `unknown` in every `catch`.
- [ ] Zero `any`; < 5 justified `as`; determinism test green.
- [ ] Framework decision + "What TypeScript found" + three explained types in README.
- [ ] Git tag `lab-06`.

### Reflections

1. What does "structural typing" mean? Give an example where two unrelated classes are interchangeable in TypeScript and would not be in C# or Java.
2. `any` vs `unknown` — what can you do with each? Where does `unknown` enter your system, and how does it leave?
3. Write a discriminated union for three message types and a handler with an exhaustive `switch`. What exactly does the `never` default catch, and when?
4. Types are erased at runtime — so what stops a malicious client sending `{ type: "input", turn: 1e9 }`? Where does that check live and why there?
5. What is a branded type? Show the definition and a bug it prevents in your code.
6. When should a function be generic? Show your typed event bus and explain how `K extends keyof E` and `E[K]` link the name to the payload.
7. Why does Vite not type-check? How do you get checking anyway, and where does it run?
8. Name three bugs TypeScript found in your migration. Were any of them *not* type errors in the naive sense (e.g., a missing `undefined` check)?
9. When is `as` acceptable? Explain each of your casts.

## Lab 07

Source: `lab-07-engine-performance-testing.md`. SHA-256: `7e2dcf36ca6bd1680a8c1ed3e2743552b6fb55ac7d531f3b6fa1f02a00e68e8f`.

### Deliverables

- [ ] Root `npm test` runs Vitest in all packages; ≥ 60 tests; ≥ 5 fast-check properties (codec round-trip, length, garbage-safety, in-arena, parser accept/reject).
- [ ] Fake-timer tests for the accumulator loop and heartbeat; reconciliation tested as a pure function.
- [ ] `shared/` coverage ≥ 85 %.
- [ ] Playwright: two contexts, one room, movement observed cross-client, chat received.
- [ ] GitHub Actions: typecheck → lint → test → build → e2e; badge; lint with type-checked rules and `no-floating-promises`.
- [ ] `performance.mark/measure` instrumentation; before/after tables and flame-chart screenshots; zero major GCs in play; p99 frame < 16.7 ms.
- [ ] Pooling / allocation-free hot paths / shape fixes, each justified by a measurement.
- [ ] Server `--cpu-prof` analysis; tick p99 before/after; spatial hash if collision was the hot spot.
- [ ] Bots with the human input interface; worker experiment with measured go/no-go; load-test chart with the capacity N.
- [ ] Git tag `lab-07`.

### Reflections

1. Draw V8's pipeline: parser → Ignition → (Maglev) → TurboFan. What triggers optimization? What triggers a deopt? Give an example from your code.
2. What is a hidden class / shape? Why is `obj.x` fast when a call site sees one shape and slow when it sees twenty? What does that mean for how you write constructors?
3. Explain generational GC. Why are young-generation collections cheap and old-generation ones expensive? Why does a *long-lived* particle cause more trouble than a short-lived one?
4. What did the profiler show as your top allocator, and what did you do about it? What's the downside of object pooling?
5. Why are typed arrays faster than arrays of objects for bulk numeric state? Name two things you lose.
6. Web Workers: three ways to move data across, with their costs. Why did your worker experiment win or lose?
7. Property-based test vs example test — when is each better? Show your codec round-trip property and explain shrinking.
8. Why is `no-floating-promises` important in a server? What bug does it prevent?
9. Your load test found capacity N. What was the bottleneck — CPU in the tick, bandwidth, or GC — and how do you know?

## Lab 08

Source: `lab-08-ship-it.md`. SHA-256: `b6e9cabd2fccdb1df59553a9b6dc04531622224dc0a527dbffbc073ef015f7ba`.

### Deliverables

- [ ] `SIGTERM` → `server.close()` → `shutdown` message + `1001` → flush → exit 0 in < 10 s; tested with `docker stop`.
- [ ] `/health` (liveness), `/ready` (readiness), version stamp; crash-on-unknown with logged stack.
- [ ] `pino` JSON logs with `roomId`/`playerId`; `LOG_LEVEL` env; no secrets logged.
- [ ] `/metrics`: players, rooms, msg/s, bytes/s, tick p99, event-loop utilization, RSS, rejections by reason.
- [ ] Zod config: `ALLOWED_ORIGINS`, per-IP cap, room/player caps; `.env.example`; secrets in platform store.
- [ ] Origin verification; per-IP connection cap; chaos tests (client kill, server kill + reconnect, garbage flood) documented with isolation metric.
- [ ] Multi-stage Dockerfile, non-root, exec `CMD`, `HEALTHCHECK`, `.dockerignore`; image size recorded (< 200 MB); `docker compose` local run.
- [ ] GitHub Actions: CI on push; tag `v*` → build → GHCR → deploy; live public WSS URL; heartbeats survive proxy idle timeout.
- [ ] Two remote strangers' match recorded; their RTT in README; uptime monitor on `/health`.
- [ ] PWA manifest + install tested; optional itch.io page.
- [ ] README as product page (GIF, URL, how to play, architecture diagram, all measurement tables, capacity + bottleneck, limitations with reasons, run-locally-in-3-commands, tag history, "What I'd do next"); demo video.
- [ ] Git tags `lab-08` and `v1.0.0`; 5-minute showcase ready.

### Reflections

1. Walk through what your process does between receiving `SIGTERM` and exiting. Why does `CMD npm start` break this? Why does ignoring `SIGTERM` drop players?
2. Why is a WebSocket server harder to scale horizontally than a REST API? Describe sticky sessions and the Redis pub/sub design. Which did you ship and why?
3. Why must the client use `wss://`? Where is TLS terminated in your deployment, and what does that mean for the proxy's WebSocket support and idle timeouts?
4. CORS doesn't apply to WebSockets — so what stops another site's page from connecting to your server as its visitors? Where do you check it?
5. Liveness vs readiness — what does each answer, and what does the platform do differently with each?
6. Why structured JSON logs to stdout rather than formatted text to a file? Why does `pino` move formatting off the main thread — which lab's lesson is that?
7. Multi-stage Docker build: what's in stage 1 that must not be in stage 2, and why? Why copy `package*.json` before the source?
8. Your load test said capacity N. A stranger's RTT was X ms. Put those two numbers together: how many concurrent players in Europe can your one instance serve well, and what would you change first?
9. If the server crashes at 3 a.m., how do you find out, and what do you look at first?
