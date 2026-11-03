# Project TODO

## Lab 08 ? implemented and verified locally; public launch pending

Requirements: [plan](docs/lab-08.plan.md). Results: [report](docs/lab-08.report.md). Release procedure: [deployment](docs/deployment.md).

- [x] Compiled JavaScript build and clean production-only runtime check.
- [x] M1: graceful drain, readiness, Pino, metrics/dashboard and version stamp.
- [x] M2: origin/IP/room/player caps, proxy trust, production endpoint policy and safe text.
- [x] Linux stalled-peer SIGTERM, SIGKILL/restart, browser reconnect and garbage-isolation experiments.
- [x] M3: 63.63 MB non-root Docker image, Compose and tested-image GHCR/digest deployment pipeline.
- [x] Staging container ramp: 8/32/64 pass; 128 fails 33 ms tick budget, with raw evidence retained.
- [x] M4 software: PWA, touch controls, product README, report, reflections and demo guide.
- [x] Local typecheck/lint/build, 106 tests, 92.55% shared line coverage, 4 browser tests and production smoke.
- [ ] Capture a cold-build wall time; verify actual public hosting, HTTPS/WSS, remote CI and proxy duration.
- [ ] Supply hosting/domain and configure protected deployment secrets/environment.
- [ ] External monitor with alert/recovery, two remote players/RTT, real phone install and demo video.
- [ ] Freeze the public release and create `lab-08` and `v1.0.0` at the deployed commit.

Docker Desktop's Linux engine was started and container checks ran successfully. Public launch is not claimed; no hosting target or real-world participants/device evidence has been provided.

## Lab 07 — completed locally

Live checklist for [Lab 07](docs/lab-07.md). Results and reproduction commands: [Lab 07 report](docs/lab-07.report.md).

- [x] Inspect requirements and preserve existing work.
- [x] M1: 102 Vitest tests, seven fast-check properties, pure reconciliation and fake timers.
- [x] Shared coverage: 92.45% lines, 91.51% statements, 90.62% functions (85% enforced).
- [x] M2: two-browser roster/movement/chat E2E, type-aware lint, CI configuration and badge.
- [x] M3: timing spans, before/after profiles, flame-chart screenshots and measured optimizations.
- [x] M4: bots, transferable replay worker, separate-process WebSocket load ramp and capacity chart.
- [x] Report: actual measurements, reproduction commands, all nine reflections and updated README.
- [x] Final verification: typecheck, lint, coverage, build, E2E, complete benchmark command.
- [x] Local submission commit and `lab-07` tag.
- [ ] Confirm GitHub Actions after a push (remote publishing was not requested).

Measured exceptions are documented: frame p99 is about 16.8 ms and major GCs still occur. The 8/32/64/128 ramp establishes capacity of at least 128 clients; it does not locate saturation. Branch coverage is 77.21% and reported separately from the enforced line/statement/function thresholds.
