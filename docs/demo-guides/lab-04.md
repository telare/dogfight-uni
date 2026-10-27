# Lab 4 demo guide: Node.js, rooms, WebSockets, and streams

Present the **lab-04** Git tag. Allow about 5–7 minutes after setup. Commands below are for **Windows PowerShell**, with Git, **Node.js 22**, and npm installed. Use `npm.cmd` to avoid PowerShell script execution-policy issues.

## 1. Checkout and reinstall dependencies

Stop any running demo servers with **Ctrl+C** first. Save your current changes with a commit or stash before switching (see the [guide index](README.md)). Keep this guide open in your editor.

```powershell
Set-Location 'D:\UNI\4th\js'
git checkout 50adb1a7e8a9935bda6066a66a0c0ea6162c636d
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed. Save conflicting local changes before continuing.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the npm error before continuing.' }
```

This commit is the version tagged `lab-04`. Detached HEAD is expected. `npm ci` reinstalls the dependencies from this commit's lockfile; run it after every lab checkout.

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

Start by saying: “This lab adds a Node HTTP/WebSocket backend, server-owned room membership, event-driven messages, and streamed NDJSON logs.”

**Controls:** W/A/D = local flight; Space/click = fire; L/Esc = lobby. Use Network → WS for the core lab evidence.

- [ ] **Prove the backend is live (30 seconds)** ? Run the health and room requests below. Open DevTools Network and find the /ws connection.

  Explain: HTTP exposes discrete endpoints; WebSockets provide a persistent channel.

- [ ] **Show two connections (60 seconds)** ? Open two browser windows, enter different pilot names, and join the same room. Inspect room/player changes and WebSocket messages.

  Explain: The backend manages rooms and socket membership. Authoritative shared movement is the next lab; do not use movement synchronization as the Lab 4 success criterion.

- [ ] **Trace a message (60 seconds)** ? Inspect a join and subsequent socket messages in the WebSocket Messages/Frames panel, then open server/src/ws.js and rooms.js.

  Explain: The handler validates/dispatches messages; room events decouple membership and broadcasts.

- [ ] **Show logs and replay streaming (60 seconds)** ? After joining, run the log commands below. Show a few NDJSON lines and download that log through the replay endpoint.

  Explain: Each line is a separate event. pipeline transfers a file incrementally and propagates backpressure.

- [ ] **Explain event-loop blocking (45 seconds)** ? Request /api/slow?ms=300 and show the timing. Locate the busy-wait in server/src/index.js.

  Explain: A synchronous loop blocks other work on that Node event loop; it is deliberately included as an experiment.

Click the game area before using shortcuts. Open DevTools with **F12** (or **Ctrl+Shift+I**); use Console, Network, and Performance as directed.

## 4. Code to have ready

Paths below refer to the files after checking out this lab commit.

- [ ] `server/src/index.js` ? HTTP routing, static files, slow endpoint and replay.
- [ ] `server/src/ws.js` ? Message validation, heartbeat, limits and socket lifecycle.
- [ ] `server/src/rooms.js` ? EventEmitter-based room membership.
- [ ] `server/src/log/matchlog.js` ? Event objects to NDJSON through a Transform.
- [ ] `server/src/log/replay.js` ? Read stream and pipeline.
- [ ] `client/src/net/connection.js` ? Browser socket connection.

## 5. Terminal evidence

Use a free terminal in the repository root. Run these before class, and keep the actual output available:

```powershell
Set-Location 'D:\UNI\4th\js'
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Run in Terminal C while both servers are running:

```powershell
Invoke-RestMethod 'http://localhost:3000/health'
Invoke-RestMethod 'http://localhost:3000/api/rooms' | ConvertTo-Json -Depth 8
Measure-Command { Invoke-RestMethod 'http://localhost:3000/api/slow?ms=300' }
```

The default log directory is `server/logs` in this tag. After joining a room:

```powershell
$demoLog = Get-ChildItem .\server\logs -Filter '*.ndjson' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content -LiteralPath $demoLog.FullName -TotalCount 5
Invoke-WebRequest "http://localhost:3000/api/replays/$($demoLog.Name)" -OutFile .\demo-replay.ndjson
Get-Content .\demo-replay.ndjson -TotalCount 5
```

Optional standalone backpressure experiment (creates a synthetic log and runs its own test server):

```powershell
node scripts/verify-backpressure.js
```

Use its measured RSS output as evidence; a stream does not guarantee perfectly constant process memory.

## 6. Questions to rehearse

- EventEmitter versus browser EventTarget? Different event APIs; EventEmitter listeners run synchronously when emitted.
- Why stream a replay? It bounds buffering instead of reading the whole file into memory.
- What is backpressure? A slow destination makes the producer pause until it can accept more.
- Why ping/pong? To detect dead connections and clean up membership.

More theory: [Lab 4 reflection answers](../reflections/lab-04-answers.md).

## 7. Finish and recover

- Press **Ctrl+C** in both development-server terminals before starting another lab. Only one demo should own ports 5173 and 3000 at a time.
- If Vite says 5173 is occupied, stop the earlier demo and rerun. `--strictPort` prevents silently opening the wrong lab on another port.
- If API/socket requests fail, confirm Terminal A is running and try `Invoke-RestMethod 'http://localhost:3000/health'`. Then reload the frontend.
- Reload to clear experiment state; restore normal DevTools throttling and remove any request blocking.
- If `npm ci` fails, keep its actual error and fix the reported install/lockfile/registry issue before class. Do not substitute dependencies from another lab.
- To return to your main branch after stopping the servers, run `git checkout master`, then `npm.cmd ci`. Restore any changes you stashed before the demos.

Ready when: the tag is correct, the page loads, the main demonstration works, and you can explain the code and actual check output above.

