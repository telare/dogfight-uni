# Deploying Dogfight

One Node process owns all rooms. `compose.deploy.yaml` is a concrete Docker VPS deployment using Caddy for HTTPS/WSS; a host and domain have not been supplied or provisioned. No paid resources are created by this repository.

## Local production

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000. `npm start` executes `node server/dist/index.js`. Shared package exports use emitted JavaScript by default; the explicit `development` condition selects source TypeScript in `dev:server`, Vitest and benchmark commands. Build shared before building server/client. TypeScript resolves the source declarations through the `types` condition.

For the production-like container:

```sh
docker compose up --build -d
docker compose logs -f game
docker compose down
```

The image contains no TypeScript source, compiler or `tsx`. It has production dependencies, emitted server/shared JS and browser assets. The container has one CPU, 256 MB RAM, a read-only root filesystem and a 32 MB ephemeral replay directory. Replays disappear on replacement; stdout JSON operational logs belong in the host's log collector. Replays can contain names/chat and are not publicly downloadable in production. Export only evidence you intend to retain.

## Configuration and security

See [.env.example](../.env.example) for production settings. `.env` is preserved locally, ignored and removed from tracking. Node reads its shell environment; Compose reads `.env` for interpolation. Malformed settings fail at startup. `ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins, with no trailing slash/path/wildcards. Production rejects missing Origin unless `ALLOW_MISSING_ORIGIN=true`; development/test permit CLI clients without Origin. All staging/public smoke clients explicitly send Origin.

Connections are counted by TCP peer IP. `TRUSTED_PROXY_IPS` permits only exact peer addresses to supply a single valid `X-Real-IP`; arbitrary `X-Forwarded-For` is ignored. The deployment network pins Caddy to `172.30.8.2`, trusts only that address, and keeps Node's port private. Caddy explicitly replaces `X-Real-IP` with `{remote_host}`. Put Caddy directly on the Internet; adding another edge proxy requires a reviewed trust-chain change. Choose a different subnet if it overlaps the host's network. Caddy supports WebSocket upgrades and streaming without a default stream timeout; see its [reverse proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Room creation and joins share the same manager cap. Requested human capacity is clamped to `MAX_PLAYERS_PER_ROOM`. Bots do not consume a room's smaller advertised human slots, but humans plus bots share the global per-room simulation cap. This preserves staging bot experiments without bypassing the deployment limit. Bots, raw replay downloads, artificial room latency/codec changes and `/api/slow` are disabled by default in production. Enable `ENABLE_DIAGNOSTICS=true` only for authorized staging. Public Caddy hides `/metrics`, `/api/stats` and the dashboard; access them over the private Docker network or an SSH tunnel.

`/health` reports liveness and `BUILD_SHA`. `/ready` is 503 until browser assets exist and during drain. WebSocket upgrades and joins stop during drain. Clients receive `shutdown`, close code 1001, bounded exponential reconnect backoff with jitter, and return to the lobby. Ephemeral matches are recreated after a restart. The close deadline terminates stalled peers; the executable has a final non-zero exit deadline if drain/flush cannot finish. Fatal exceptions/rejections log stacks, drain, then exit non-zero for supervisor recovery.

`/metrics` is Prometheus text. Counters are process lifetime totals. Dashboard rates and ELU cover the interval since the previous scrape; use Prometheus `rate()` on counters for independent windows. Tick p99 is nearest-rank over each room's latest 60 ticks (~2 seconds). Room labels are bounded numeric slots, not user IDs; slots may change when rooms are removed. The dashboard is `/dashboard.html` in local/staging.

## Host preparation and releases

1. Supply a Linux Docker host, SSH access, domain, region and budget. Install Docker with Compose, open inbound TCP 80/443 and point DNS at the host. Run exactly one game instance; no external state or sticky routing is implemented.
2. Create `/opt/dogfight`, copy `deploy.sh`, `compose.deploy.yaml`, and `Caddyfile`, and make `deploy.sh` executable. Put `DOMAIN=your.domain` in `/opt/dogfight/.env`. Allow the deployment SSH user to run Docker. If GHCR is private, authenticate Docker on the host with a least-privilege package-read credential before deployment.
3. Configure the GitHub **production** environment with required reviewers. Variables: `DEPLOY_HOST`, `DEPLOY_USER`, `PUBLIC_URL` (https origin). Secrets: `DEPLOY_KEY` and `DEPLOY_KNOWN_HOSTS` (verify the host key out-of-band). Keep credentials in secret stores, outside git and images.
4. Use a release candidate `v1.0.0-rc.1` first. The workflow runs typecheck, lint, coverage, build, production-only smoke, browser tests, Docker build and Linux lifecycle checks. It saves that tested image, pushes the same bytes to GHCR under the commit SHA, then deploys the registry digest through the protected environment. It never deploys `latest`.
5. `deploy.sh` remembers the previous digest and restores it if Compose readiness fails. Public smoke verifies SHA, HTTPS, WSS, join and 70 seconds of live traffic. If public smoke fails despite container readiness, manually roll back: `./deploy.sh "$(cat previous-image)"`. Investigate edge/DNS/certificate failures before promoting.
6. After staging and real users pass, freeze a release commit; create `lab-08` and `v1.0.0` at that same commit, push via the normal release process, and verify the public SHA. Tags have not been created because the public release is not yet verified.

## Reproduce checks and experiments

```sh
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:production
npm run test:e2e
docker build --build-arg BUILD_SHA=local -t dogfight:lab08 .
node scripts/container-smoke.js dogfight:lab08
```

`production-smoke.js` builds an isolated temporary installation using `npm ci --omit=dev`; it checks the absence of source/dev tools, HTTP/PWA assets, missing/foreign Origin rejection, per-IP cap including a spoofed forwarded address, protocol rejection, traffic metrics and graceful close. Windows uses IPC to invoke the exported drain; `container-smoke.js` supplies real Linux SIGTERM, stalled peer, SIGKILL/restart and `docker stop` evidence.

On **authorized staging only**, use an isolated container with `MAX_CONNECTIONS_PER_IP=160`, `MAX_PLAYERS_PER_ROOM=128`, `ENABLE_DIAGNOSTICS=true` and your explicit Origin. Set `STAGING_URL`, `ORIGIN`, `CLIENTS=8` (then 32/64/128), and `SECONDS=10`; run `npm run bench:staging`. The generator runs outside the game process. It creates a fresh room, kills/replaces a client in another room, offers garbage at a 1 ms interval until the offending socket closes, and records stats/metrics before/during/after. A healthy room must retain all clients and every sampled tick p99 must remain under 33 ms. Saved JSON includes failures. This is a local container capacity bound, not proof of public-host capacity or real RTT.

## Launch evidence still needed

Configure an external monitor against public `/health` once per minute, two failures before alert, and verify both alert and recovery. Save settings and screenshots without credentials. Keep `/ready` for deployment routing rather than an external uptime promise.

Have two people on different networks join the same room simultaneously. Record UTC session time, server SHA, anonymized region, RTT median/p95 from Netgraph, and server tick/RSS/ELU; save a GIF/video. Do not substitute loopback RTT. Install the PWA on a real phone and verify landscape layout, touch thrust/turn/fire, reconnect, offline notice and updating after all old app windows close. Browser automation checks service-worker registration/offline behavior, not real phone installation. No full offline gameplay is promised.
