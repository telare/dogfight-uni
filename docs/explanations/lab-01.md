# Lab 01 — event loop and game loop

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-01` (commit `2735386`).

```powershell
git checkout lab-01
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. Keep the server terminal running.

- **Say first:** “Input, simulation and drawing are separate. Simulation uses fixed steps; drawing follows browser animation frames.”
- **React connection:** held keys/world objects resemble mutable refs. Updating them does not trigger a React render; Canvas drawing is scheduled explicitly.

## Explain in order

1. **Input:** keydown adds a code to a Set; keyup removes it. `isDown` means held; `justPressed` means a new press.
2. **Scheduling:** `requestAnimationFrame` requests a callback at a browser rendering opportunity.
3. **Elapsed time:** calculate seconds since the previous callback.
4. **Accumulator:** collect elapsed time; repeatedly consume `1/60` second to run simulation.
5. **Physics:** input changes acceleration/rotation, then velocity and position; arena logic wraps the ship.
6. **Drawing:** historical Lab 01 blends previous/current state using the remaining fraction, `alpha`.
7. **Cleanup:** stop the loop and remove listeners when their owner is finished.

```text
keydown → held-key Set → simulate(1/60) → ship position → draw
```

- Example: 25 ms accumulated → one 16.67 ms step → 8.33 ms left → alpha ≈ 0.5.
- A 120 Hz screen can draw more often without doubling the chosen simulation rate.
- The 0.25 s elapsed-time clamp limits catch-up after a stall; it can discard wall time.

## Open these files

- [Input](../../client/src/input.ts): closure-owned key state.
- [Loop](../../client/src/loop.ts): `tick`, accumulator, start/stop.
- At `lab-01`: `src/sim/ship.js`, `src/render/draw.js`, `src/main.js`.
- Current multiplayer HEAD uses prediction smoothing rather than local alpha interpolation.

## Demonstrate

- Fly, cross an edge, resize, and identify FPS versus simulation steps/s.
- At the historical tag: toggle blocking, interval scheduling and variable timestep using its [demo guide](../demo-guides/lab-01.md).

## Teacher questions

- **Why does a busy loop freeze input?** Synchronous work occupies the main thread until it finishes.
- **Does a Promise move it to another thread?** No; synchronous CPU work inside a promise still blocks.
- **Why a fixed step?** Equal starting state and ordered steps make simulation more repeatable.
- **Evidence limit:** historical experiment numbers lack raw captures; a saved 60/120 Hz comparison is missing.

[Reflection answers](../reflections/lab-01-answers.md) · [Evidence audit](../labs-audit.md#lab-01--eventgame-loop) · [Next lab](lab-02.md)
