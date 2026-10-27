# Lab 5 demo guide: Authoritative multiplayer, prediction, and binary protocol

Present the **lab-05** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout 366b6efcfc3d95ffd57ba5730eee04c74ad00c39
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-05`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

## 2. Start development and open the browser

**Terminal A — backend, leave running:**

```powershell
Set-Location 'D:\UNI\4th\js'
$env:PORT = '3000'
npm.cmd run dev:server
```

**Terminal B — frontend, leave running:**

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd run dev --workspace=client -- --host localhost --port 5173 --strictPort
```

**Terminal C — open the browser after both servers report ready:**

```powershell
Set-Location 'D:\UNI\4th\js'
Start-Process 'http://localhost:5173'
Start-Process 'http://localhost:5173'
```

Arrange the two pages side by side (drag one tab into a separate window if needed). The browser uses Vite on **5173**; Vite proxies API/socket requests to Node on **3000**. `npm run dev` starts only the frontend in this tag.

## 3. What to present

Start by saying: “The server runs the match at 30 Hz. My browser predicts its own movement, reconciles against authoritative snapshots, and interpolates remote entities.”

**Controls:** W/A/D = fly; Space/click = fire; L/Esc = lobby; 4 = Netgraph. Use the overlay buttons/sliders for networking experiments.

- [ ] **Establish two-player state (60 seconds)** ? Join the same room in two windows using different names. Fly and shoot in one, then observe it in the other.

  Explain: Both clients receive the authoritative match. Use W/A/D and Space; give the game area keyboard focus.

- [ ] **Open network telemetry (45 seconds)** ? Press 4 to toggle Netgraph if hidden. Show snapshot frequency, RTT, packet bytes, pending inputs, and correction magnitude.

  Explain: Server ticks and browser frames are different clocks. Live numbers vary; measure this run.

- [ ] **Compare prediction (60 seconds)** ? Set artificial latency to about 100 ms. Turn Prediction off, try moving, then turn it on. Keep Recon+Smooth on.

  Explain: Local prediction applies intent immediately. The checkbox changes client processing; describe the behavior you actually observe.

- [ ] **Demonstrate reconciliation (45 seconds)** ? Use the artificial desync button. Watch correction magnitude and recovery with Recon+Smooth enabled.

  Explain: Discard acknowledged commands, restore server state, replay pending commands, and smooth the display offset.

- [ ] **Compare remote interpolation (45 seconds)** ? Watch the other player moving. Toggle Interpolate off/on; optionally add modest jitter.

  Explain: Buffering snapshots adds display delay but makes remote movement smoother.

- [ ] **Compare codecs (45 seconds)** ? Switch Binary/JSON while keeping a similar scene. Compare snapshot bytes and inspect WS frames. Restore latency/jitter/drop to zero and all three checkboxes to enabled.

  Explain: Binary uses fixed field sizes and quantization; JSON is easier to inspect. Some control messages remain JSON.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `server/src/match.js` ? 30 Hz authoritative stepping and snapshots.
- [ ] `shared/src/sim/world.js` ? Shared simulation used by client and server.
- [ ] `client/src/net/prediction.js` ? Sequence numbers, pending inputs, replay and smoothing.
- [ ] `client/src/net/interpolation.js` ? Buffered remote snapshots and wrap-aware blending.
- [ ] `shared/src/codec/spec.js` ? Binary layout and byte sizes.
- [ ] `shared/src/codec/binaryCodec.js` ? DataView encoding/decoding.
- [ ] `server/src/latency.js` ? Artificial network conditions.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd test
npm.cmd run lint
npm.cmd run build
node scripts/benchmark-codecs.js
```

Press **4** for Netgraph: this tag registers N in more than one place, so N may toggle it twice.

With the backend running, optional headless multiplayer verification:

```powershell
node scripts/verify-dogfight.js
Invoke-RestMethod 'http://localhost:3000/api/stats' | ConvertTo-Json -Depth 8
```

The Lab 5 tag contains JavaScript runtime files alongside partial TypeScript files. Use its `.js` entry points and scripts above; reserve strict TypeScript claims for Lab 6.

## 6. Questions to rehearse

- Why authoritative? Clients send intent; the server decides accepted match state.
- How do seq and ackSeq work? The client removes commands up to the acknowledged sequence and replays the rest.
- Why interpolate in the past? Two known snapshots can be blended without predicting remote input.
- Why DataView? It supports mixed field types and explicit byte order.
- Does shared code guarantee identical live worlds? No; initial state, steps, inputs and ordering must also match.

More theory: [Lab 5 reflection answers](../reflections/lab-05-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in both development-server terminals before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- If API/socket requests fail, confirm Terminal A is running and try `Invoke-RestMethod 'http://localhost:3000/health'`. Then reload the frontend.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

