# Lab demo guides

Each guide presents the corresponding historical Git tag and includes PowerShell commands for checkout, dependency installation, development servers, opening the browser, terminal checks, and a teacher-facing demonstration script.

| Lab | Guide | Development servers |
| --- | --- | --- |
| 1 | [Event loop and fixed timestep](lab-01.md) | Vite only |
| 2 | [Entities, prototypes, composition, and this](lab-02.md) | Vite only |
| 3 | [Promises, asynchronous assets, audio, and HTTP lobby](lab-03.md) | Vite only |
| 4 | [Node.js, rooms, WebSockets, and streams](lab-04.md) | Node backend + Vite |
| 5 | [Authoritative multiplayer, prediction, and binary protocol](lab-05.md) | Node backend + Vite |
| 6 | [Strict TypeScript and validated shared contracts](lab-06.md) | Node backend + Vite |

Each guide uses **`git checkout <full commit hash>` in `D:\UNI\4th\js`**, followed by **`npm.cmd ci`** and the appropriate development commands. Run one lab at a time and stop its servers with **Ctrl+C** before switching. Installation requires access to the npm registry.

Save local changes before the first checkout. If you want to stash them while keeping these currently untracked guides on disk:

```powershell
Set-Location 'D:\UNI\4th\js'
git stash push -u -m 'before-lab-demos' -- . ':(exclude)docs/demo-guides'
```

Note the stash entry Git creates. After all demos, return and reinstall:

```powershell
git checkout master
npm.cmd ci
```

Then apply the stash entry you saved, if any. Keep the guide open in your editor when switching; if these guides are committed later, earlier lab commits will not contain them.

These instructions were checked against files and package scripts in local tags `lab-01` through `lab-06`. Historical applications and dependency installs have not been rerun as part of writing these guides; use each guide's rehearsal checks before class.

