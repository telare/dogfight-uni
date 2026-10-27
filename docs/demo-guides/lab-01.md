# Lab 1 demo guide: Event loop and fixed timestep

Present the **lab-01** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout 27353863ff00953c2b5563bd2860663af81ba11e
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-01`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

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

Start by saying: “This lab separates input, simulation, and rendering. A fixed simulation step keeps movement independent of the display refresh rate.”

**Controls:** W/Up = thrust; A/Left and D/Right = turn; Space = pause/resume; 1/2/3 = experiments.

- [ ] **Baseline (45 seconds)** ? Hold W, turn with A/D, cross an arena boundary, and resize the browser. Point to the FPS, simulation steps, and frame-time HUD.

  Explain: Input is sampled continuously; the canvas resizes; the ship wraps around the arena.

- [ ] **Block the main thread (45 seconds)** ? Press 1, fly for several seconds, and watch the periodic freeze and frame-time spike. Press 1 again.

  Explain: Synchronous work occupies the main thread, delaying input and rendering. Record your observed values rather than quoting the old report.

- [ ] **Compare schedulers (45 seconds)** ? Press 2 to use the interval scheduler. Watch the HUD, briefly switch tabs, then return. Press 2 again.

  Explain: requestAnimationFrame follows rendering opportunities; timers have scheduling jitter and background throttling. Exact FPS depends on the machine.

- [ ] **Compare timesteps (60 seconds)** ? Press 3 for variable timestep. Use DevTools Performance CPU throttling if available and compare movement with fixed timestep. Restore normal CPU speed, press 3 again, and reload.

  Explain: Large, uneven dt changes numerical integration. A fixed step improves repeatability under equal initial state and input; manual flying is a qualitative comparison.

- [ ] **Pause and code (45 seconds)** ? Press Space to pause/resume, then open src/loop.js and explain the accumulator.

  Explain: Elapsed time enters the accumulator, simulation consumes 1/60-second steps, and alpha blends render states.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `src/loop.js` ? rAF scheduling, fixed step, frame clamp, experiment switches.
- [ ] `src/input.js` ? Closure-owned held/pressed key state and listener cleanup.
- [ ] `src/sim/ship.js` ? Movement integration separated from browser APIs.
- [ ] `src/render/draw.js` ? Interpolation and shortest-path angle blending.
- [ ] `index.html` ? ES module entry point.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd run lint
npm.cmd run build
```

## 6. Questions to rehearse

- Why clamp elapsed time? To bound catch-up work after long stalls.
- Why do Promise callbacks precede a zero-delay timer? Microtasks drain after synchronous code before the next task.
- What does alpha mean? The fraction of a simulation step left in the accumulator.

More theory: [Lab 1 reflection answers](../reflections/lab-01-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in Terminal A before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

