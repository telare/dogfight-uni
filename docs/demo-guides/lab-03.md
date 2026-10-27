# Lab 3 demo guide: Promises, asynchronous assets, audio, and HTTP lobby

Present the **lab-03** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout 03c8f01c51c1e7be529e4ca9433d801839770ce8
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-03`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

## 2. Start development and open the browser

**Terminal A — leave running:**

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

**Terminal B — open the browser after Vite reports ready:**

```powershell
Set-Location 'D:\UNI\4th\js'
Start-Process 'http://localhost:5173'
```

This tag needs only Vite; there is no Node game server to start.

## 3. What to present

Start by saying: “This lab loads resources asynchronously, reports progress, separates lobby data from its view, and connects gameplay events to audio and HUD updates.”

**Controls:** W/A/D = fly; Space/click = fire; L/Esc = lobby; B = asset benchmark; K/H/P = earlier entity experiments.

- [ ] **Show loading (60 seconds)** ? Open DevTools Network, disable cache while DevTools is open, choose a slower network preset, and reload. Watch the loading screen and manifest/image/audio requests.

  Explain: Resources load asynchronously with progress feedback. Restore normal network speed afterward.

- [ ] **Show the HTTP lobby (45 seconds)** ? Inspect /api/rooms.json in Network. Enter a pilot name, select a room, and join.

  Explain: This version uses a static HTTP room list and local gameplay. It does not yet demonstrate synchronized multiplayer.

- [ ] **Show audio and events (45 seconds)** ? Click or press a key to unlock audio, then fly, shoot, and trigger a collision or pickup.

  Explain: Browser audio needs a user gesture; gameplay events let audio and HUD react without putting presentation code in physics.

- [ ] **Compare loading strategies (60 seconds)** ? Open Console and press B. Wait for the sequential/parallel benchmark output and show the measured durations.

  Explain: Independent loads can run concurrently through Promise.all. Cache and network conditions affect the measured speedup.

- [ ] **Show cancellation and failure handling (60 seconds)** ? Return to the lobby with L/Esc. Open loader.js and lobby.js; locate AbortController, timeout, HTTP status checks, and withRetry.

  Explain: Cancellation stops obsolete work; retries use backoff/jitter and avoid retrying ordinary 4xx errors. Explain these code paths even if a request completes too quickly to observe cancellation.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `src/assets/loader.js` ? fetchJson, withRetry, loadAll, progress and resource failures.
- [ ] `src/assets/benchmark.js` ? Sequential versus parallel loading.
- [ ] `src/lobby/lobby.js` ? EventTarget model, HTTP requests, polling and cancellation.
- [ ] `src/lobby/lobbyView.js` ? DOM view kept separate from lobby data.
- [ ] `src/audio/audio.js` ? Web Audio and user gesture unlock.
- [ ] `src/ui/hud.js` ? Event-driven presentation.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Optional command-line loader benchmark, from the repository root:

```powershell
npm.cmd run benchmark
```

If testing a failed asset, use DevTools request blocking on one asset URL, reload, and inspect the loader's actual error/fallback behavior. Remove the block before presenting the normal run.

## 6. Questions to rehearse

- Why check response.ok? fetch can resolve successfully for HTTP error responses.
- Why Promise.all? Independent operations start together; an unhandled rejection rejects the aggregate.
- Why cancel? A previous request may no longer be relevant after leaving the lobby.
- Why no sound on initial load? Audio playback is restricted until a user gesture.

More theory: [Lab 3 reflection answers](../reflections/lab-03-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in Terminal A before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

