# Lab explanations for a React developer

Each lab has a separate concise guide. Follow its numbered flow, open the linked files, then practice the demonstration and teacher questions.

| Lab | Explanation |
| --- | --- |
| 01 | [Event loop and game loop](explanations/lab-01.md) |
| 02 | [Entities, classes and composition](explanations/lab-02.md) |
| 03 | [Promises, loading and lobby](explanations/lab-03.md) |
| 04 | [Node, rooms, WebSockets and streams](explanations/lab-04.md) |
| 05 | [Authoritative multiplayer and prediction](explanations/lab-05.md) |
| 06 | [Strict TypeScript and schemas](explanations/lab-06.md) |
| 07 | [Tests and measured optimization](explanations/lab-07.md) |
| 08 | [Production and deployment](explanations/lab-08.md) |

## Common idea

- React: event -> state update -> React render -> DOM commit.
- Game: input state -> fixed simulation step -> world state -> explicit Canvas drawing.
- Think of the engine as a long-lived object in a ref: internal mutation does not schedule a React render.
- For each lab, explain: problem -> code flow -> demonstration -> design reason -> limitation.
- Use historical tags for historical behavior; current TypeScript code has evolved.

[Reflection answers](reflections/README.md) | [Run/demo instructions](demo-guides/README.md) | [Evidence audit](labs-audit.md)

## Switching versions

- Each lab guide starts with its own `git checkout`, install and run commands.
- Stop running servers with **Ctrl+C** before changing versions.
- Save local changes first. Checking out a tag/commit enters detached HEAD; that is normal for a demo.
- Earlier commits may not contain these guides once they are committed. Keep a copy outside the checkout or keep the guide open separately.
- Return to the latest branch and run it:

```powershell
git checkout master
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**.
