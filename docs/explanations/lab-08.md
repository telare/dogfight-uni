# Lab 08 — production lifecycle and deployment

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-08` (commit `ae03a85`).
- `lab-08` marks the locally verified implementation; public launch and `v1.0.0` remain pending.

```powershell
git checkout lab-08
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. Keep the server terminal running.

- **Say first:** “The application is prepared to run under a supervisor, with compiled code, bounded shutdown, diagnostics and resource limits.”
- **React connection:** setup/cleanup still matters, but now it applies to a whole process: listeners, timers, connections and streams.

## Explain in order

1. **Build:** compile shared/server TypeScript and build browser assets.
2. **Runtime:** Node executes emitted JavaScript; the final image excludes source/compiler/tsx.
3. **Container:** multi-stage build, non-root user, exec-form Node command and healthcheck.
4. **Readiness:** accept work only when assets exist and shutdown has not started.
5. **Shutdown:** mark unready → stop accepting → notify clients → close 1001 → stop timers → await streams/connections → flush logs.
6. **Deadline:** terminate stalled peers; exit non-zero if the executable cannot finish shutdown.
7. **Security boundary:** validate Origin, enforce caps and trust proxy headers only from configured peers.
8. **Observability:** structured logs plus metrics explain failures and capacity.
9. **Release:** test an image, publish it, deploy its immutable digest and verify version/HTTPS/WSS.
10. **PWA:** manifest/icons/service worker support installation; offline navigation explains reconnection.

## Open these files

- [Dockerfile](../../Dockerfile), [local Compose](../../compose.yaml).
- [Server lifecycle](../../server/src/index.ts), [WS limits](../../server/src/ws.ts).
- [Metrics](../../server/src/metrics.ts), [CI/release workflow](../../.github/workflows/ci.yml).
- [Deployment guide](../deployment.md), [report](../lab-08.report.md).

## Results to demonstrate

- Image about 63.63 MB; runtime UID 1000.
- Saved stalled-peer Linux drain: exit 0 in about 1.28 s.
- Docker stop, crash/restart, browser reconnect and offline checks pass.
- One-CPU/256 MB container: 64 clients pass; 128 exceed the tick budget.

## Teacher questions

- **Liveness versus readiness?** Process responds versus process can accept work.
- **Why WSS?** Secure pages need secure socket transport; the provided proxy terminates TLS.
- **Why one instance?** Rooms live in process memory; random routing across instances can split a match.
- **Does caching make multiplayer work offline?** No; a running server is still necessary.
- **What remains?** Public host/WSS, remote players/RTT, monitor alerts, real phone installation, video and final tags. Configuration is not deployment evidence.

[Reflection answers](../reflections/lab-08-answers.md) · [Demo](../demo-guides/lab-08.md) · [All-labs audit](../labs-audit.md)
