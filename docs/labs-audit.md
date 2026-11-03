# All-labs reflection and deliverable audit

Audited on 2026-11-03 against the eight **official local course briefs**, their milestones, definitions of done and deliverable checklists. Code/evidence baseline: `ae03a853a0a29c83e7f14e052b3ab6398cf6292b`. This audit adds documentation corrections; it does not change the historical tags or claim missing experiments were performed.

The [requirements snapshot](audit/requirements.md) preserves all **71 checklist items and 69 reflection questions**, original order, filenames and SHA-256 hashes. Four Lab 02 reflection questions (5–8) are optional; all 69 now have answers. [Machine-readable inventory](audit/inventory.json) records counts, assertion totals and GIF metadata.

**Status meanings:** Supported = located source/test/artifact supports the stated scope; Reported = historical report gives a result but independently inspectable raw measurement evidence is missing; Partial = some subrequirements are missing or differ; Pending = required evidence/action has not happened. Supported source is not proof of every empirical acceptance condition. Earlier tags were inspected with `git show`; historical dependency installs, browser sessions and hardware experiments were not rerun.

## Main findings

- Reflection coverage is complete after correcting Lab 05's actual interpolation delay/angle precision, replacing Lab 06's project-specific placeholders and adding a discoverable Lab 07 answer file.
- Lab 01's three experiments have numbers in its tagged README, but no raw captures were found. The 60/120 Hz acceptance comparison is not demonstrated by saved evidence.
- Lab 03 has five ordering puzzles and failure-handling descriptions, but no saved loading-screen failure screenshots/log gallery proving all four required cases. Lobby API examples alone do not establish missing-sprite/slow-asset behavior.
- Lab 04's historical backpressure table covers **30 MB**, not the required **200 MB**; its runner also hardcodes 30 MB and uses a synthetic slow Writable rather than a DevTools-throttled browser download. The report's text bars are not evidence of the required 200 MB experiment.
- Lab 05's GIF is **36 generated frames, 2.16 seconds, 820×360**. [Its generator](../scripts/generate-gif.py) draws scripted ships; it is not a recorded multiplayer session and does not meet the 20-second capture requirement. README now labels it honestly. The live interpolation-delay control and authoritative replacement of predicted bullets by matching IDs are not evidenced as complete.
- Lab 06 has four justified const assertions at its tag and zero explicit `any` types. Current HEAD has six const assertions after the two metrics tuples: the historical constraint passes, current source exceeds the literal `<5` count.
- Lab 07 preserves real raw profiles, captures, worker/load results and nine answers. Zero major GC / frame p99 <16.7 ms was **not achieved**; the report explicitly explains the measured limits. The load ramp never crossed 33 ms, so exact capacity N/bottleneck was not found. Its tag is local only.
- Lab 08 has substantial local/container evidence and passing CI, but public hosting/WSS, monitor alerts, two remote players' RTT, phone installation, video and final tags are still pending. Some abuse limits have unit/runtime tests rather than dedicated real staging-load evidence.

## Reflection index

| Lab | Official questions | Answers | Audit outcome |
| --- | ---: | --- | --- |
| 01 | 8 | [Lab 01](reflections/lab-01-answers.md) | All present; added historical/current renderer distinction. |
| 02 | 8 (4 optional) | [Lab 02](reflections/lab-02-answers.md) | All present, including optional questions. |
| 03 | 8 | [Lab 03](reflections/lab-03-answers.md) | All present; combinator scenarios are identified as use-case examples. |
| 04 | 9 | [Lab 04](reflections/lab-04-answers.md) | All present. Historical README contains less precise wording; use these canonical answers. |
| 05 | 9 | [Lab 05](reflections/lab-05-answers.md) | Corrected 66 ms delay and 0.001 rad quantization; documented actual overrun scheduling. |
| 06 | 9 | [Lab 06](reflections/lab-06-answers.md) | Actual brands/bus, migration findings and all assertions now explained. |
| 07 | 9 | [Lab 07](reflections/lab-07-answers.md) | Already in the report; now indexed in the same directory as the others. |
| 08 | 9 | [Lab 08](reflections/lab-08-answers.md) | All present; external measurements/setup remain explicitly unavailable. |

## Lab 01 — event/game loop

Historical evidence: [tagged README](https://github.com/telare/dogfight-uni/blob/lab-01/README.md), especially sections 4–6; [demo guide](demo-guides/lab-01.md). Row numbers follow the official checklist, not inferred feature groups.

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 01.1 | Vite, ESM, lint/format config, Node version | Supported | `lab-01` manifests, `.nvmrc`, ESLint/Prettier config. |
| 01.2 | rAF, clamped accumulator, stats and HUD | Supported | Tagged `src/loop.js`, `src/render/draw.js`; current [loop tests](../client/test/lab07.vitest.js). Cross-machine 60 steps/s is not measured here. |
| 01.3 | Input closure, held/edge state | Supported | Tagged `src/input.js`; evolved [current module](../client/src/input.ts). |
| 01.4 | Pure integration and wrapping, no sim DOM | Supported | Tagged `src/sim/ship.js` and `arena.js`; shared determinism tests preserve equal-condition simulation behavior. |
| 01.5 | Interpolation, angle wrap, DPR/resize | Partial | Tagged main explicitly calls `interpolateShip(previous, ship, alpha)`; canvas/angle helpers present. No saved 60-versus-120 Hz smoothness/step-count experiment. Current multiplayer renderer uses prediction smoothing instead of local `alpha`. |
| 01.6 | Three measured experiments and explanations | Reported | Tagged README reports 100 ms blocking peaks 116.8–120.4 ms; interval jitter 11.2–24.8 ms; variable-step X 912.4/847.1 versus fixed 912.4/912.4. No raw logs/screenshots establish those historical values or the CPU/background-tab conditions. |
| 01.7 | `lab-01` tag | Supported | Local and remote tag present. |

Milestone-specific gap: ship-tuning rationale is described generally in historical physics discussion; no separately saved change-by-change tuning experiment was located. Do not treat later 60 Hz performance traces as the missing 120 Hz test.

## Lab 02 — entities/composition

Historical evidence: [tagged README](https://github.com/telare/dogfight-uni/blob/lab-02/README.md), sections 4–6; [demo guide](demo-guides/lab-02.md).

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 02.1 | Pure vectors, private static IDs, shallow inheritance | Supported | Tagged vector/entity/ship source; current vector tests and shared [Entity](../shared/src/sim/entity.ts). |
| 02.2 | Map World, iterator/generator, deferred removal | Supported | Tagged `World.despawn` marks `alive=false`; step sweeps. Iterator and `ofKind` are present. |
| 02.3 | TTL bullets, asteroid, explosion particles, pickup, fire | Supported historically | `lab-02:src/sim/explosion.js`, bullet/asteroid/pickup/ship modules. `Explosion` is no longer a shared entity after migration: current shared kind union has only ship/bullet/asteroid/pickup. Do not demonstrate HEAD as proof that the historical Explosion entity still exists. |
| 02.4 | Deliberate `this` bug, selected fix and alternatives | Supported | Tagged README section 5 contains the faulty callback and three fixes with tradeoffs; historical demo key. |
| 02.5 | Collision system, private HP, respawn, score | Supported | Tagged collision/ship/world source; current [collision](../shared/src/sim/collision.ts), `#hp`, 2 s respawn timer and tests. This audit did not replay every historical visual. |
| 02.6 | Homing/pickup composition and short design explanation | Supported | Tagged README section 6, homing component used by bullets/asteroids; current [components](../shared/src/sim/components.ts). |
| 02.7 | `lab-02` tag | Supported | Local and remote tag present. |

No benchmark or gameplay recording is explicitly required by this lab; absence of one is not itself a failure.

## Lab 03 — asynchronous loading/lobby

Historical evidence: [tagged README](https://github.com/telare/dogfight-uni/blob/lab-03/README.md), sections 5–7; [demo guide](demo-guides/lab-03.md), [regression runner](../scripts/test-lab03.js).

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 03.1 | Abortable image/audio/JSON, checked HTTP, bounded retry | Supported | Asset loader and retry source; regression runner includes 404/retry cases. |
| 03.2 | Concurrent load/progress and sequential comparison | Reported / partial | Loader uses concurrent work and progress UI; tagged table reports sequential 274.4 ms versus concurrent 54.1 ms averages. No raw benchmark capture was saved; deliberate missing and slow asset evidence is absent. |
| 03.3 | Sprite sheets and gesture-unlocked Web Audio | Supported | Sprite assets, renderer/audio modules and startup loading; sound is present in source, not audibly rechecked by this audit. |
| 03.4 | EventTarget/CustomEvent decouples sim from presentation | Supported historically | Lab 03's event bus and world source; no audio/HUD imports in sim. Lab 06 later replaces the bus with a typed implementation intentionally. |
| 03.5 | EventTarget lobby, refresh/timeout, abort-on-leave, separate view | Supported historically / partial currently | Tagged `Lobby extends EventTarget`; current typed Lobby retains abort/join/leave methods. Main's Escape show/hide path does not call `lobby.leave()` to resume polling after a join; current visibility lifecycle needs a dedicated regression check. |
| 03.6 | Five puzzles plus four-case failure gallery | Partial | Five puzzles with outputs/explanations are in tagged section 6. Section 7 describes 404/timeout/abort/bad JSON but has no captured loading-screen screenshot/log for each and no missing-sprite/slow-asset capture. |
| 03.7 | `lab-03` tag | Supported | Local and remote tag present. |

Do not label an error-handling explanation or button as a recorded experiment result. Capture all four loader cases and their recovery UI to finish the gallery.

## Lab 04 — Node/streams/WebSockets

Historical evidence: [tagged README](https://github.com/telare/dogfight-uni/blob/lab-04/README.md), sections 5–7; [demo guide](demo-guides/lab-04.md). Current [server tests](../server/test/server.test.js) and Lab 08 container evidence supplement the historical implementation.

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 04.1 | Workspaces, ESM, `node:` imports | Supported | Root/workspace manifests and server imports. |
| 04.2 | HTTP static/MIME/traversal, rooms API, health, dev proxy | Supported | [HTTP server](../server/src/index.ts), Vite config and server tests. |
| 04.3 | Validated env, `--env-file`, graceful SIGTERM | Partial | Env validation exists; current Linux drain verified in [container evidence](production/container-smoke.json). Development scripts do not load `--env-file`; `.env` must be supplied via shell or explicit Node flag. Historical graceful handler was improved in Lab 08. |
| 04.4 | EventEmitter rooms/manager, roster/chat, join timeout | Supported | [Rooms](../server/src/rooms.ts), [WS](../server/src/ws.ts), integration tests. |
| 04.5 | Versioned validated JSON; bad/oversize closes | Partial | JSON variants are schema validated, bad/oversize traffic closes with codes. Binary frames have version guards; JSON messages have no negotiated/per-message version field. A version constant alone is not a JSON compatibility handshake. |
| 04.6 | Heartbeat/errors, reconnect/backoff/send queue | Partial | Source, fake timer, real socket and browser restart tests. Heartbeat terminates at the next interval after one unanswered ping, rather than literally waiting for two missed pong responses as the milestone says. |
| 04.7 | NDJSON Transform/pipeline, streaming replay, RSS proof | Partial | Streams and replay source present. Historical table and [runner](../scripts/verify-backpressure.js) cover 30 MB, not 200 MB. No required browser-throttled 200 MB trace/graph. MatchLog producer's `write(false)` branch only attaches an empty drain handler; it does not pause/drop subsequent producer writes, so the replay-read result does not prove a bounded recording queue. |
| 04.8 | Rate/payload/room/player/slow-client caps | Supported currently / partial historically | Current WS/manager limits, tests and staging rejection evidence. Lab 08 adds global caps and checks slow output; original comments/logging alone should not be accepted as enforcement. Real staging slow-output pressure still lacks a dedicated measurement. |
| 04.9 | Blocking/backpressure explanation and crash/fix excerpt | Reported | Tagged sections 5–7 include blocking behavior and a crash/fix excerpt. No independently captured paired-client 300 ms timing trace/crash log was found outside that report. |
| 04.10 | `lab-04` tag | Supported | Local and remote tag present. |

## Lab 05 — prediction/network protocol

Historical report: [archived Lab 05 sections](lab-reports.md), [tagged README](https://github.com/telare/dogfight-uni/blob/lab-05/README.md), [demo guide](demo-guides/lab-05.md). The archived codec layout/prose contains inaccuracies; current codec source/tests are authoritative, and the archive now links this audit.

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 05.1 | Pure seeded shared sim, browser/Node determinism | Supported within equal-condition tests | Shared package/PRNG, Node imports, determinism/migration tests. Not a proof of identical live browser/server worlds. |
| 05.2 | Authoritative 30 Hz timer, stats, validated/rate-limited input | Supported | [Match](../server/src/match.ts), WS/parser, scheduling and socket tests. |
| 05.3 | Sequenced inputs; tick and per-player acknowledgement | Supported with semantic caveat | `ackSeq` is the project's acknowledgement field. Current `lastProcessedSeq` advances when input is queued and inputs are coalesced, then snapshots follow the step; this differs from retaining every command and acknowledging each after its own simulation step. |
| 05.4 | Prediction/replay/smoothing and determinism-break result | Partial | Prediction/reconcile code and tests; historical report describes drift demonstration. No before/after Netgraph screenshot of the deliberate break was found. Different live 60/30 Hz stepping/coalescing remains documented. |
| 05.5 | Adjustable interpolation and entity lifecycle; predicted bullets | Partial | Buffer/66 ms delay and seam/cleanup tests exist. Netgraph has on/off only, no live delay adjustment. Local firing exists but authoritative bullet identity replacement is not implemented/evidenced as a complete matching-ID path. |
| 05.6 | Latency/jitter/drop injector and Netgraph | Supported | Source and historical multiplayer runner. Saved proof of all exact 100 ms ±30 ms/2% conditions is missing. |
| 05.7 | Spec, DataView, round trips, JSON/binary table | Partial | Typed [spec](../shared/src/codec/spec.ts), codecs and tests; table reports 1496/304 bytes and 21.37/1.79 µs. Archive wrongly describes full-Int16 angle scaling and some offsets/kind IDs; actual angle factor is 1000. Historical throughput is fixture-derived application payload, not a saved four-live-player network capture. |
| 05.8 | 20 s two-player GIF and one-page netcode write-up | Partial | Write-up exists. Existing GIF is generated illustration (2.16 s), not gameplay evidence. Actual side-by-side 20 s recording is missing. |
| 05.9 | `lab-05` tag | Supported | Local and remote tag present. |

The archived input-layout diagram also differs from the actual encoder (`flags` at offset 10, turn at 11, reserved final byte). Do not defend the archive's diagram without checking [binaryCodec](../shared/src/codec/binaryCodec.ts).

## Lab 06 — strict TypeScript

Evidence: [migration report](lab-reports.md), [demo guide](demo-guides/lab-06.md), current typecheck/tests and source inspected at `lab-06`.

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 06.1 | Strict root/package configs, root typecheck and CI | Supported | tsconfigs, fresh local typecheck and successful remote CI at the audited HEAD. |
| 06.2 | Readonly vectors, discriminated kinds, branded IDs | Supported | [Vector](../shared/src/sim/vector.ts), protocol schemas/type contracts. |
| 06.3 | Schemas/inferred types/Result parser, old validator removed | Supported | Shared protocol; server protocol is an adapter to shared parsing rather than a separate hand-written shape definition. |
| 06.4 | Typed codecs and range/version validation | Supported | Codec interface, JSON/binary implementations and round-trip/malformed-frame tests. |
| 06.5 | Exhaustive message/entity handling | Supported for principal dispatches | Client/server use `assertNever`; binary entity encoding is exhaustively dispatched. Guard/branch logic also exists: this is not a claim that every conditional is literally a `switch`. |
| 06.6 | Typed events/config; unknown catches | Supported | Typed Room/Bus, schema config; strict checking and lint pass. |
| 06.7 | Zero `any`, <5 justified assertions, determinism | Supported at tag / partial at HEAD | TypeScript AST count: `lab-06` has 4 `as const`, zero explicit any; HEAD has 6 `as const`, zero explicit any. Tests pass. [Answer 9](reflections/lab-06-answers.md#9-acceptable-assertions) explains each. |
| 06.8 | Framework decision, actual migration findings, three types | Supported | Archived report contains each; corrected reflection answers now use actual code/findings instead of placeholders. |
| 06.9 | `lab-06` tag | Supported | Local and remote tag present. |

## Lab 07 — testing/performance

Evidence: [report](lab-07.report.md), [raw profiles/results](performance/), [tests](audit/tests-coverage.log), [browser checks](audit/e2e.log). Historical reports are measurement snapshots; later resource limits/workloads produce different capacity results.

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 07.1 | >=60 Vitest tests, >=5 stated properties | Supported with scope note | 106 current tests; seven properties. Parser properties cover selected generated message/mutation domains, not literally every possible mutation (some mutations remain valid). |
| 07.2 | Fake timers for loop/heartbeat, pure reconcile tests | Supported | Client/server lab07 tests and reconciliation module. |
| 07.3 | Shared coverage >=85% | Supported | Fresh run: 92.55% lines, 91.61% statements, 91.17% functions; 77.26% branches reported separately. |
| 07.4 | Two-context roster, movement <500 ms, chat | Supported | Multiplayer Playwright test passes locally and remotely. |
| 07.5 | Typed lint/no-floating-promises, CI and badge | Supported | Config and successful [HEAD CI](https://github.com/telare/dogfight-uni/actions/runs/41700697124). |
| 07.6 | Before/after marks/profiles; zero major GC and <16.7 ms p99 | Partial, explained | Real profiles, flame charts, 30 s browser and 60 s server results exist. Frame p99 remains 16.8 ms; major GC 39→20, not zero. DoD permits a precise limits explanation; strict checklist targets are still unmet. |
| 07.7 | Measured allocation/shape/pooling changes | Supported | Star color caching, reused interpolation records, 10 Hz Netgraph and one encode per tick; measurements and patch retained. No unmeasured bullet pool claim. |
| 07.8 | Server CPU profile, before/after tick p99 | Supported | CPU profiles/hotspot summaries and report; spatial hash not justified by measured hotspot. |
| 07.9 | Bots, measured worker decision, capacity crossing/chart | Partial | Bots/worker/capacity chart have raw measurements. Local ramp stayed below 33 ms through 128; exact crossing and bottleneck not found in Lab 07. Lab 08's different container experiment brackets 64 pass/128 fail, without replacing the original workload result. |
| 07.10 | `lab-07` tag | Partial | Present locally; missing from remote tag list on audit date. |

## Lab 08 — production/launch

Evidence: [report](lab-08.report.md), [deployment](deployment.md), [production artifacts](production/), [demo guide](demo-guides/lab-08.md).

| Item | Required result | Status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 08.1 | SIGTERM notify/1001/flush/exit0 <10s, docker stop | Supported | Saved stalled-peer 1281 ms drain, exit0; docker stop 572 ms; notification/close assertions. |
| 08.2 | Health/readiness/SHA, fatal-stack behavior | Supported in code / partial experimental evidence | Endpoints/runtime tests and configured crash handlers; SIGKILL/restart is tested, but a genuine uncaught exception/rejection followed by supervisor restart is not a saved experiment. Local health stamp is `lab08-local`, not a deployed release SHA. |
| 08.3 | Pino/log-level/IDs/no secret payloads | Supported | Logger and structured operational events; replay storage is explicitly separate from operational stdout. |
| 08.4 | Players/rooms/traffic/tick/ELU/RSS/rejections | Supported | Metrics source, raw metric windows, [dashboard](production/dashboard.png) during bot match. |
| 08.5 | Validated config, limits, example env, managed secrets | Partial | Source/example env and local secret-history check; production platform secrets cannot be configured without a target. |
| 08.6 | Origin/IP caps and chaos/isolation; all limits under load | Partial | Clean-runtime origin/IP/protocol checks, browser/server restart and staging garbage/isolation results. Dedicated staging payload/rate/join-timeout/heartbeat/slow-output load evidence is incomplete. 128-client run fails budget; 8/32/64 pass. |
| 08.7 | Multi-stage/non-root/exec/health/image<200MB/Compose | Supported | Docker source, 63.63 MB image/UID1000 and lifecycle evidence. Compose config validates; a full public proxy stack was not launched. |
| 08.8 | Tag build/GHCR/deploy and live WSS/heartbeats | Partial | Gated tested-image digest pipeline exists; branch CI succeeds. Tag publish/deploy and public WSS/70s heartbeat smoke not run. |
| 08.9 | Two external players, RTT, uptime monitor | Pending | No real session, external RTT or verified alert/recovery. |
| 08.10 | PWA manifest and phone installation | Partial | Icons/manifest/SW, browser registration/offline test, touch controls; no real-phone installation/update/control evidence. |
| 08.11 | Finished product README, real GIF/video/measurements | Partial | Product text, diagram, tables/limitations/next steps exist. Public URL, real recorded GIF, remote RTT, 3–5 minute video and launch capacity chart remain missing. |
| 08.12 | `lab-08`, `v1.0.0`, showcase | Pending | Neither release tag exists. Demo script exists; no actual showcase/video. |

Milestone experiment extras: source-only cached rebuild is timed; cold build total wall time is not. No public hosting experiment, POSIX STOP/CONT health/ELU capture or deployed proxy timeout test is saved.

## Verification performed for this audit

Fresh checks against the audited code all exited 0: [typecheck](audit/typecheck.log), [lint](audit/lint.log), [106 tests and coverage](audit/tests-coverage.log), [four browser tests](audit/e2e.log). [Verification metadata](audit/verification.json) records commit/time/exit codes. No new performance results were substituted for historical captures. The pushed branch's complete GitHub Actions [run succeeded](https://github.com/telare/dogfight-uni/actions/runs/41700697124), including compiled production smoke and Linux container smoke.

Local tags 01–07 were inspected. Remote tags 01–06 exist; 07 is missing, and 08/v1.0.0 are absent. Checking remote state is read-only; this audit does not publish tags, commits or releases.

## Work needed before saying every lab is fully evidenced

1. Save raw Lab 01 experiment outputs and the 60/120 Hz comparison; preserve historical numerical claims as reported until reproduced.
2. Capture Lab 03's four actual loader failures/recovery and repeat loader concurrency timing with saved output; verify current lobby visibility/poll lifecycle.
3. Run Lab 04's actual 200 MB throttled replay with RSS samples/graph, capture blocking/crash/fix output, and address/document producer-side recording backpressure and protocol/heartbeat/env-file deviations.
4. Record a real >=20 s Lab 05 side-by-side session at the requested latency/jitter/drop, capture deliberate determinism break/recovery, complete live delay and bullet-identity behavior, and correct the archived binary layout before using it for defense.
5. Decide whether to preserve the Lab 06 assertion cap at current HEAD (historical tag already complies), then publish the existing Lab 07 tag only when requested.
6. Keep Lab 07's precise performance exceptions; extend profiling/ramp if an exact saturation N is required.
7. Complete Lab 08's remaining staging-abuse/fatal-crash/cold-build experiments and external deployment/players/monitor/phone/video/release work.

These gaps are not resolved by the existence of an unchecked checklist, a reproduction command, a generated illustration or a theoretical reflection answer.
