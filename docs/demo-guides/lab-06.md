# Lab 6 demo guide: Strict TypeScript and validated shared contracts

Present the **lab-06** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout db39aee96a15324500480fe9956766ed68049f10
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-06`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

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

Start by saying: “This lab migrates the client, server, and shared simulation to strict TypeScript, derives message types from runtime schemas, and verifies compatibility with Lab 5.”

**Controls:** W/A/D = fly; Space/click = fire; L/Esc = lobby; 4 = Netgraph; overlay = codec and latency controls.

- [ ] **Show the toolchain (60 seconds)** ? Run typecheck, lint, tests, and build using the commands below. Open tsconfig.base.json.

  Explain: strict and noUncheckedIndexedAccess check all three packages. Build success alone does not establish type safety.

- [ ] **Show protocol contracts (60 seconds)** ? Open shared/src/protocol/protocol.ts. Trace unknown input through a Zod parser and then a switch on message.type.

  Explain: A discriminated union narrows fields after validation. TypeScript types alone do not validate incoming JSON.

- [ ] **Show rejected mistakes (60 seconds)** ? Open client/src/type-contracts.ts. Explain its @ts-expect-error examples for wrong payloads, mixed numeric brands, and readonly mutation.

  Explain: EntityId, Tick and Seq distinguish different numeric concepts. Expected-error assertions are checked by typecheck; no source edits are needed for the demo.

- [ ] **Show typed events (45 seconds)** ? Open shared/src/events.ts and client/src/net/bus.ts. Find an emit/subscribe use.

  Explain: The event name determines the payload type; subscribers can clean up through an unsubscribe function.

- [ ] **Prove gameplay still works (60 seconds)** ? Join the same room in two windows, fly and fire, open Netgraph with 4, and compare JSON/Binary.

  Explain: The TypeScript migration preserves the multiplayer demo. Runtime schemas/codecs still reject invalid network data.

- [ ] **Explain regression evidence (45 seconds)** ? Open server/test/migration.test.js and server/test/lab06.test.js, then show the test output.

  Explain: Migration tests compare simulation behavior with lab-05 under controlled conditions. Explain failures if any; do not claim a historical test count as the current result.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `tsconfig.base.json` ? Shared strict compiler configuration.
- [ ] `shared/src/protocol/protocol.ts` ? Zod schemas, inferred unions, brands, Result parsers and assertNever.
- [ ] `shared/src/events.ts` ? Typed event map and generic bus.
- [ ] `client/src/net/bus.ts` ? Client event contracts.
- [ ] `client/src/type-contracts.ts` ? Compile-time rejection examples.
- [ ] `server/src/config.ts` ? Validated environment configuration.
- [ ] `server/test/migration.test.js` ? Comparison against the Lab 5 tag.
- [ ] `server/test/lab06.test.js` ? Runtime contract regression checks.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

The migration test reads the `lab-05` tag from Git. Confirm it is available:

```powershell
git rev-parse --verify lab-05
```

With the backend running, optional runtime evidence:

```powershell
node --import tsx scripts/verify-dogfight.js
node --import tsx scripts/benchmark-codecs.js
```

Use `--import tsx` for these Lab 6 scripts because they import TypeScript. The server's development command already handles this.

## 6. Questions to rehearse

- Why validate when TypeScript already checks types? External bytes arrive at runtime after types are erased.
- What does a brand change at runtime? The number representation stays the same; constructors validate values and brands distinguish types at compile time.
- Why assertNever? To surface a newly added union variant that a dispatcher has not handled.
- Why keep vanilla DOM? The existing lobby/HUD are small; the report records the framework tradeoff.
- What did migration catch? Nullable canvas contexts, optional Map/array lookups, DOM event narrowing, and unvalidated JSON boundaries.

More theory: [Lab 6 reflection answers](../reflections/lab-06-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in both development-server terminals before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- If API/socket requests fail, confirm Terminal A is running and try `Invoke-RestMethod 'http://localhost:3000/health'`. Then reload the frontend.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

