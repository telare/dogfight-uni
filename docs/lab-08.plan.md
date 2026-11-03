# Lab 08 completion plan — Ship It

Status: repository implementation and local verification completed on 2026-11-03; public launch/evidence pending. The original planning checklist below is retained as the acceptance specification; current completion and measured exceptions are tracked in [TODO.md](../TODO.md) and the [implementation report](lab-08.report.md).

The final deliverable is a public HTTPS/WSS game, production evidence, two remote players' measurements, a finished product README, and tags `lab-08` and `v1.0.0`.

## Starting point

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Verification | Lab 07 recorded 102 passing tests, 92.45% shared line coverage and passing two-context E2E | Preserve regressions; add production and chaos tests |
| Serving | Node serves `client/dist`; client derives WS/WSS from page origin | Production build, TLS/proxy verification and a public deployment |
| Runtime | Server starts with `tsx`; shared exports point at `.ts`; entry guard checks `index.ts` | Compiled JS entry, runtime package exports and production-only dependencies |
| Lifecycle | SIGTERM handler closes sockets and rooms, then calls `process.exit(0)` | Readiness, shutdown notification, bounded drain, awaited close/flush and failure handling |
| Diagnostics | `/health`, `/api/stats`, recent tick p99, RSS and lifetime ELU | Version stamp, interval metrics, traffic/rejection counters and dashboard |
| Limits | Payload/rate limits, join timeout, heartbeat, slow-client handling | Origin verification, per-IP cap and global room/player limits |
| Public exposure | `/api/slow` deliberately blocks Node; bots can be added through HTTP; replay downloads expose logs; lobby uses interpolated HTML | Production switches/access policy and safe rendering of user text |
| Configuration | Zod configuration exists; `.env` is tracked | Production settings, `.env.example`, remove `.env` from tracking while preserving the local file |
| Capacity | At least 128 clients on local loopback, not an exact saturation point | Staging load results under the intended container resources and real RTT |
| Tools | Docker CLI and GitHub CLI are installed | Docker's Linux engine is currently unavailable; start Docker Desktop before container checks |

## Deployment design

- Use one Node instance that serves both the client and `/ws` under one HTTPS origin. Keep all rooms in that process; document this limit.
- Compile server and shared TypeScript to JavaScript. Keep the existing source-based development workflow and make the runtime image depend only on emitted files and production dependencies.
- Use the hosting platform's TLS termination and WebSocket-capable reverse proxy. Select a region near the expected players after the hosting account/budget is known.
- Use Pino JSON logs on stdout and Prometheus-format `/metrics`, with a small dashboard or saved dashboard evidence. Keep labels bounded; player IDs belong in logs, not metric labels.
- Keep optional stretch work—Redis, multiple instances, accounts, matchmaking, lag compensation and itch.io—outside the required implementation.

## 1. Establish the production build

- [ ] Add production TypeScript configs/build commands for `server/dist` and `shared/dist`. Rewrite relative `.ts` import extensions for emitted JS, using the installed compiler's supported option.
- [ ] Produce runtime package metadata whose `shared` exports resolve to compiled JS. Verify npm workspace links in the production install; retain source exports for development through an explicit, tested build arrangement.
- [ ] Put runtime libraries in the owning package's production dependencies. In particular, shared code imports Zod, which is currently declared only among root development dependencies.
- [ ] Replace the `index.ts`-only startup guard with an explicit executable entry that works for compiled JS and does not start listening when tests import modules.
- [ ] Add separate development/build/production-start commands. The production command runs `node server/dist/index.js` directly.
- [ ] Validate asset/config/log paths from the built layout. A runtime containing no source files, `tsx` or dev dependencies must serve the game and accept a WebSocket connection.

Exit check: clean build plus a production-only installation can run the compiled game, and the existing development/tests still work.

## 2. M1 — Process lifecycle and observability

- [ ] Separate construction, start and stop so tests can create isolated server instances. Existing modules currently attach global signal handlers during import.
- [ ] Add a validated `shutdown` server message to the shared protocol, all exhaustive dispatches and the client. Display a clear restart notice and return to the lobby.
- [ ] Implement an idempotent drain: mark unready; reject new HTTP upgrades/joins; stop listening; notify existing clients; close with `1001`; stop simulation timers; await socket/HTTP closure and log flushing.
- [ ] Add a deadline below the supervisor grace period; terminate lingering sockets on timeout and handle repeated termination signals. Prefer natural process exit after draining, with a deliberate failure exit for unexpected errors.
- [ ] Keep `/health` as liveness; add `/ready` returning 503 before assets are available or while draining. Include the build SHA/version in health responses and the HUD.
- [ ] Log unexpected exceptions/rejections with stack traces and exit non-zero; verify restart through the supervisor instead of continuing with uncertain state.
- [ ] Replace prose console logs with Pino events and `LOG_LEVEL`; include `roomId`/`playerId` where relevant. Avoid logging secrets and complete chat/input payloads. Keep replay storage policy separate from operational logs.
- [ ] Expose players, rooms, inbound/outbound messages and bytes, tick duration/p99, interval ELU, RSS and rejections grouped by a fixed reason set. Define collection windows and quantiles explicitly.
- [ ] Add a dashboard view or reproducible dashboard configuration and capture it during a bot match.

Exit check: a Linux container receives SIGTERM, clients observe the restart message and `1001`, readiness drops, logs flush and exit code is 0 in under 10 seconds. Test stalled clients too. Use the container for real POSIX signal behavior on this Windows host.

## 3. M2 — Hardening and realistic failure tests

- [ ] Extend Zod config with `ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS`, `MAX_PLAYERS_PER_ROOM` and the production diagnostics policy. Reject malformed configuration at startup.
- [ ] Preserve the local `.env`, remove it from Git tracking, ignore it and add `.env.example` with documented non-secret defaults. Check tracked history for actual secrets and rotate any discovered secret; do not assume the current configuration values are credentials.
- [ ] Validate origins during the upgrade handshake, before registering a game session. Define explicit behavior for missing Origin headers, staging and CLI load clients; update test clients to send the expected origin.
- [ ] Enforce connection limits and release counts on every close/error/failed-upgrade path. Trust forwarded IP headers only from the configured deployment proxy; test spoofed headers and the proxy's actual behavior.
- [ ] Enforce room/player caps atomically across HTTP and WebSocket paths, with a documented policy for bots.
- [ ] Disable `/api/slow` in production. Disable or restrict bot spawning, raw replay downloads and other development controls in a public deployment. Keep staging bot/load experiments explicitly enabled.
- [ ] Render pilot names, room names and chat with text nodes or equivalent escaping. Add a browser regression proving an HTML-like name/chat displays as text.
- [ ] Confirm payload, token-bucket, join-timeout, heartbeat and buffered-output policies against the staging container.
- [ ] Exercise connection loss and reconnect behavior, including stale socket events, repeated failures, capped exponential backoff with jitter and lobby recovery after a restarted server. In-memory matches are not promised to survive a restart.
- [ ] Add a chaos runner: terminate one client; terminate/restart the server; send garbage at 1,000 frames/s. Record rejection/close reasons and tick p99 in another room before, during and after the attack.
- [ ] Define the isolation acceptance rule before running the experiment: the healthy room must retain clients and stay below the 33 ms tick budget. Save raw windows and metrics, including any failure.

Exit check: invalid origins and floods are rejected, counted and logged; connection counts recover after cleanup; another room stays responsive. Browser text injection tests pass.

## 4. M3 — Container, staging and deployment pipeline

- [ ] Start Docker Desktop's Linux engine and verify the daemon is available.
- [ ] Add a multi-stage Dockerfile, `.dockerignore` and Compose configuration. Copy root/workspace manifests before source to preserve dependency caching.
- [ ] Build client/server/shared in the builder; copy only compiled runtime files, required manifests and a production-only install into the final stage.
- [ ] Run as a non-root user, set `NODE_ENV=production`, use exec-form Node CMD, bind to the configured port/`0.0.0.0`, and add a health check using tooling actually present in the image.
- [ ] Make any writable log/replay directory intentional and non-root-writable. Document restart persistence/retention instead of assuming container files survive deployment.
- [ ] Record image size (target under 200 MB), a cold build and a cached rebuild after a source-only change. Run `docker stop` and save shutdown timing/exit evidence.
- [ ] Extend the load tool to accept an external staging HTTP/WS URL, Origin and target room, rather than always importing the server in the generator process. Stop increasing load when the agreed resource/safety limit is reached.
- [ ] Repeat 8/32/64/128 loads against staging under documented container limits. If the budget is not crossed, report a lower bound; do not present localhost results as public-host capacity.
- [ ] Select a host after verifying its current WebSocket upgrade support, idle timeout, TLS, single-instance settings, sleep behavior, region and cost. Record the choice and required configuration.
- [ ] Extend GitHub Actions: normal checks gate changes; `v*` tags run the same gates, build one SHA-labelled image, push to GHCR and deploy that exact digest. Use restricted permissions, a protected deployment environment and repository/platform secrets.
- [ ] Add a staging/production promotion or release-candidate path, public smoke check and documented rollback to the previous image digest. Never rely on `latest` to identify a release.
- [ ] Verify public HTTPS, WSS, allowed origins, health SHA and readiness. Keep sockets connected longer than the documented proxy idle timeout and observe heartbeats.

Exit check: a staging release candidate passes container smoke/load/chaos tests; the pipeline deploys an immutable image; the public URL shows its exact SHA and supports two browser sessions over WSS.

## 5. M4 — Launch evidence and submission

- [ ] Add a distinct PWA web manifest, suitable icons and a minimal service worker. The existing `/assets/manifest.json` is an asset list, not a PWA manifest.
- [ ] Cache the app shell deliberately; exclude `/api`, `/ws`, health and metrics from offline caches. Show a useful disconnected state and test update activation so an old cached client does not silently use an incompatible protocol.
- [ ] Verify browser installability and installation on a real phone; test controls/layout on that device. Obtain real evidence rather than treating desktop emulation as a phone install.
- [ ] Configure an external uptime monitor for `/health`, verify an alert and recovery notification, and record its settings without exposing credentials. Creating paid resources or sending invitations requires a concrete user-authorized setup.
- [ ] Arrange two people on networks different from the developer's to join the same room simultaneously. Record anonymized RTT, location/region, session time, server SHA and dashboard metrics; save a gameplay GIF/video.
- [ ] Rewrite the README opening as the product page: live URL, hero GIF, controls, local start in three commands, architecture, JSON/binary measurements, GC tables, staging capacity and real RTT.
- [ ] Explain limitations with reasons: one process, ephemeral matches, interpolation delay, measured capacity bounds and remaining frame/GC limits. Add "What I'd do next" and complete tag history.
- [ ] Create `docs/lab-08.report.md`, nine reflection answers, a reproducible demo guide and a 3–5-minute demo video. Prepare the five-minute showcase: 60 seconds playing with a classmate, then one deep dive.
- [ ] Run final typecheck/lint/coverage/build/E2E, production-image smoke, staging load/chaos and public smoke checks. Verify remote CI, not just the local equivalent.
- [ ] Freeze one release commit; create `lab-08` and `v1.0.0` pointing to it. Publish through the tested pipeline and verify the public SHA matches that commit.

Exit check: the public game works, real remote players' evidence and monitoring exist, PWA installation is verified, and both final tags identify the deployed submission.

## Implementation order and dependencies

1. Production build and testable lifecycle.
2. Protocol/reconnect behavior, logging and metrics.
3. Origin/IP/room limits, safe text rendering and development-endpoint policy.
4. Container plus automated production/load/chaos checks.
5. Hosting selection, staging, CI/CD and public WSS verification.
6. PWA, remote-player session, monitoring, README/video and release tags.

The software work can proceed through the reviewable container and deployment configuration before account access is needed. Hosting account/region/budget and deploy credentials are needed for a real deployment; two remote participants and a phone are needed for the final evidence. Ask for these when their concrete setup is ready. No deployment, account change, invitation or release tag is part of this planning-only task.
