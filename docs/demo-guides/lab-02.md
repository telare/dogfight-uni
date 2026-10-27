# Lab 2 demo guide: Entities, prototypes, composition, and this

Present the **lab-02** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout f694fb9d8a5e36d84c2204092924743c4265c53f
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-02`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

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

Start by saying: “This lab turns one ship into an entity world with collisions, bullets, pickups, and respawning, and demonstrates how detached methods lose their receiver.”

**Controls:** W/A/D or arrows = fly; Space/click = fire; Esc = pause/resume; K = alternate broken/fixed this; H = homing asteroid; P = random pickup.

- [ ] **Play the entity world (60 seconds)** ? Fly with W/A/D and fire with Space or a click in the game area. Shoot asteroids and show score, damage, and explosion effects.

  Explain: Ship, bullets, asteroids, pickups, and effects have separate state and update/render behavior.

- [ ] **Show lifetime and respawn (45 seconds)** ? Let an asteroid hit the ship; if it dies, wait for respawn. Point out health and score.

  Explain: Entities can be marked dead and cleaned up after iteration; the ship has a respawn timer.

- [ ] **Demonstrate this (60 seconds)** ? Open DevTools Console. Press K once and show the caught error from the detached method. Press K again and show the successful bound call.

  Explain: A bare function call has undefined this in strict mode. ship.fire.bind(ship, world) preserves its receiver and argument.

- [ ] **Show composition (45 seconds)** ? Press H to spawn a homing asteroid. Press P to spawn a random pickup; fly toward it if practical.

  Explain: Homing is reusable behavior rather than another inheritance level. P chooses randomly, so do not promise a particular bonus.

- [ ] **Walk through storage (60 seconds)** ? Open src/sim/world.js, entity.js, and components.js.

  Explain: World stores entities in a Map, supports iteration, and separates lifetime management from reusable behavior.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `src/sim/entity.js` ? Base entity, private ID allocation, common state.
- [ ] `src/sim/ship.js` ? Inheritance, health encapsulation, fire and respawn.
- [ ] `src/sim/world.js` ? Map storage, iterator/generator, deferred cleanup.
- [ ] `src/sim/collision.js` ? Circle collision detection and resolution.
- [ ] `src/sim/components.js` ? Reusable homing behavior.
- [ ] `src/main.js` ? runThisExperiment: detached method and bind fix.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd run lint
npm.cmd run build
```

## 6. Questions to rehearse

- Where does this come from? From the call form; binding explicitly fixes the receiver.
- Why Map? Stable ID lookup and iteration over live objects.
- Why defer deletion? To keep lifecycle changes separate from the update/collision pass.
- Why composition? The same behavior can be attached to different entity types.

More theory: [Lab 2 reflection answers](../reflections/lab-02-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in Terminal A before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

