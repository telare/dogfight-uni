# Lab 03 — promises, loading and lobby

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-03` (commit `03c8f01`).

```powershell
git checkout lab-03
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. Keep the server terminal running.

- **Say first:** “Startup is an asynchronous workflow with progress, cancellation, retries and recovery.”
- **React connection:** like fetching in an effect: the owner starts work, observes results and cancels work when leaving.

## Explain in order

1. **Manifest:** describes the images, sounds and arena data to load.
2. **Loaders:** fetch/decode individual resources and accept AbortSignal.
3. **Concurrency:** `Promise.all` waits for independent asset requests; progress updates as items finish.
4. **HTTP errors:** check `response.ok`; fetch does not automatically reject a 404.
5. **Body parsing:** obtaining a Response and reading its JSON/body are separate asynchronous stages.
6. **Retry:** retry transient failures with bounded backoff/jitter; avoid retrying missing 4xx resources and cancelled work.
7. **Lobby:** fetch rooms, render through a separate view, cancel pending work on join/leave.
8. **Events:** simulation emits fired/hit events; sound and HUD subscribe without being imported by simulation.

```text
manifest → concurrent tasks → progress → loaded resources → start game
request → response.ok → parse body → data or handled failure
```

## Open these files

- [Loader](../../client/src/assets/loader.ts): `loadAll`, `fetchJson`, `withRetry`.
- [Lobby model](../../client/src/lobby/lobby.ts) and [view](../../client/src/lobby/lobbyView.ts).
- [Audio](../../client/src/audio/audio.ts): gesture unlock and decoded sounds.
- Historical Lab 03 uses EventTarget/CustomEvent; later TypeScript migration introduces a typed Bus.

## Demonstrate

- Show loading progress, room requests in Network and a gesture unlocking audio.
- Explain what cancellation/retry changes in the UI.
- Follow the historical [demo guide](../demo-guides/lab-03.md).

## Teacher questions

- **Does await block the thread?** It suspends that async function; it does not move synchronous work to another thread.
- **Does Promise.all cancel other requests after rejection?** No; cancellation must be explicit.
- **Why abort?** Prevent obsolete work/results after the owner leaves.
- **Evidence limit:** the actual four-case loading failure/recovery gallery is missing; descriptions are not captures.

[Reflection answers](../reflections/lab-03-answers.md) · [Evidence audit](../labs-audit.md#lab-03--asynchronous-loadinglobby) · [Next lab](lab-04.md)
