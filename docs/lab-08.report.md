# Lab 08 — production implementation and local verification

Implemented and checked on 2026-11-03. Repository implementation is complete; public launch requirements remain open because no hosting target/domain, external participants or real phone were supplied. The [deployment guide](deployment.md) contains the concrete release procedure. No live URL, remote RTT, monitoring alert, phone installation, demo video or release tags are claimed.

## Implemented

Server/shared compile to JavaScript with rewritten relative import extensions. Runtime shared exports resolve to `dist`; development explicitly selects source. The production-only smoke creates a clean temporary workspace, installs only production dependencies and proves the game works without source, TypeScript or tsx.

The application factory supports isolated lifecycle tests; process handlers are installed only by the executable. Drain is idempotent: readiness drops, upgrades/joins stop, HTTP closes, clients get the validated shutdown message and 1001, simulation timers stop, replay streams close and Pino flushes. Stalled sockets are terminated at a deadline, and a final executable deadline fails non-zero if shutdown is stuck. Fatal exceptions/rejections log stacks and exit non-zero. Clients clear session identity, reconnect with capped backoff/jitter, and return to the lobby after loss/restart.

Pino JSON events include room/player identifiers, configured log level and build version. Health and HUD display `BUILD_SHA`. Prometheus text exposes players/rooms, message/byte counters and rates, recent tick p99, interval ELU, RSS and fixed rejection reasons. [Dashboard capture](production/dashboard.png) was taken during an eight-bot match. Its collection windows and private production access are documented.

Handshake origin validation, per-peer IP limits with exact proxy trust, room/player/bot caps, safe rendering of user text and production diagnostic switches are implemented. `.env` remains on disk but is removed from tracking and ignored; `.env.example` documents defaults. Inspection of the tracked `.env` history found configuration values rather than credentials; no secret rotation was needed. Replay filenames encode room IDs, preventing names from escaping the log directory.

The multi-stage Docker image runs as UID 1000, executes Node directly and has a readiness healthcheck. Local and VPS Compose configurations limit resources and use ephemeral replay storage. The tag pipeline gates checks, promotes the exact tested image to GHCR by digest, deploys through a protected GitHub environment, and performs public SHA/HTTPS/WSS smoke. The VPS deployment includes Caddy, a constrained proxy trust boundary, automatic rollback on failed container readiness, and a documented manual digest rollback. This configuration has not been run on a public host or remote GitHub Actions.

PWA manifest, 192/512 PNG icons, deliberate shell-only service worker, useful offline navigation and touch controls are included. Waiting workers avoid replacing an active app session. API/health/metrics/socket traffic is excluded from offline caching. Real phone install/update testing remains open.

## Verification

| Check | Result |
| --- | --- |
| Typecheck / lint / full build | Pass |
| Vitest | 106 passed across 12 files |
| Shared coverage | 92.55% lines; 91.61% statements; 91.17% functions; 77.26% branches |
| Playwright | 4 passed: multiplayer movement/chat, crash/reconnect/lobby, HTML-like user text, PWA/offline exclusions |
| Production-only runtime | Pass; shutdown notification/1001, 14 ms drain in the Windows IPC harness |
| Linux image size | 63,631,579 bytes (63.63 MB), below 200 MB |
| Linux UID / source-free runtime | UID 1000; no source/compiler/tsx |
| SIGTERM with stalled peer | Exit 0 in 1,281 ms; healthy client receives shutdown/1001 |
| SIGKILL / restart | Abnormal close followed by successful fresh join |
| `docker stop` | Exit 0 in 572 ms |
| Source-only cached rebuild | 21.685 seconds; npm layers reused |

Raw [container lifecycle evidence](production/container-smoke.json) includes structured logs. [Cached build log](production/build-cached.log) and [timing](production/build-cached.json) are saved. The first cold build succeeded, but total cold wall time was not captured; no cold timing is invented. Linux uses the Docker Desktop engine on the Windows host, Node 22 Alpine, one CPU and 256 MB. The lifecycle experiment sets a 1,000 ms close deadline to exercise stalled-peer cleanup; normal production defaults to 5,000 ms.

## Staging container load and chaos

The separate Node generator connected 8/32/64/128 real WebSocket clients, sent movement/fire inputs at approximately 60 Hz and sampled a 10-second window after a 2.1-second warmup. Staging explicitly raised the IP cap to 160 and per-room cap to 128; production defaults remain lower. A second room lost/replaced a client and received garbage at an offered 1,000 frames/s until its first invalid frame closed the connection with 1002. The acceptance rule was fixed before running: every healthy client stays connected and every sampled healthy-room p99 stays below 33 ms. Each room's p99 covers its latest 60 ticks; these are overlapping sampled windows, not a global run-wide percentile.

| Clients | Maximum sampled tick p99 | Peak sampled RSS | Healthy clients lost | Acceptance |
| ---: | ---: | ---: | ---: | --- |
| 8 | 5.151 ms | 81.03 MB | 0 | Pass |
| 32 | 13.743 ms | 82.46 MB | 0 | Pass |
| 64 | 21.758 ms | 85.05 MB | 0 | Pass |
| 128 | 49.438 ms | 89.41 MB | 0 | **Fail: tick budget** |

All raw before/during/after stats and metrics, including the failure, are in [production evidence](production/). **64 clients passed this particular local resource-limited experiment; 128 did not.** This narrows the tested bound without finding the exact saturation point. At 128 the before-attack window already exceeded 33 ms, so the failure cannot be attributed to the garbage frame. RSS remained below the memory limit; CPU/simulation/fan-out cost under the one-CPU quota is a plausible bottleneck, requiring profiling to confirm. The single short run is not a public capacity guarantee or a soak test. The flood is stopped by immediate protocol rejection, so it does not establish resilience to a distributed connection storm.

Server kill/restart is additionally verified by the container lifecycle runner and a real browser E2E proving lobby recovery and reconnect. Public proxy duration, real network RTT and actual hosting capacity must still be checked on the selected host.

## Remaining submission evidence

- Supply host/domain and configure the protected production environment, registry access and SSH secrets; run release candidate deployment and public WSS smoke.
- Capture a measured cold build, verify public heartbeats beyond the intended proxy timeout and remote CI.
- Configure external health monitoring and verify failure/recovery notifications.
- Record two simultaneous players from other networks, their anonymized RTT/region/time/SHA and gameplay footage.
- Install/update on a real phone and check touch/layout/reconnect behavior.
- Record the 3–5 minute demo using the [demo guide](demo-guides/lab-08.md); freeze the verified public release and create `lab-08` / `v1.0.0` at that commit.

All nine [whiteboard reflections](reflections/lab-08-answers.md) are written. The README now opens as the product page, consolidates historical measurements and links measured production evidence while keeping launch placeholders explicit.
