# Lab 06 — strict TypeScript and runtime schemas

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-06` (commit `db39aee`).

```powershell
git checkout lab-06
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. Keep the server terminal running.

- **Say first:** “TypeScript checks our code; Zod validates untrusted messages while the game runs.”
- **React connection:** typed props help callers, but a server response still needs runtime validation. Network messages have the same boundary problem.

## Explain in order

1. **Strict configs:** enable strict/null/index checks in all workspaces.
2. **Unknown input:** parsed network data is not automatically trusted.
3. **Schema:** validate type, fields and ranges with Zod.
4. **Result:** branch on success before changing game state.
5. **Inferred types:** derive TypeScript types from schemas instead of maintaining a conflicting interface.
6. **Discriminated union:** `message.type` determines which fields exist.
7. **Exhaustiveness:** a never branch exposes an unhandled new variant during typechecking.
8. **Brands:** EntityId, Tick and Seq remain numbers at runtime but are distinct types.
9. **Typed bus:** `K extends keyof E` chooses the event; `E[K]` chooses its payload.

```text
raw data → unknown → schema validation → typed message → dispatch
```

## Open these files

- [Root config](../../tsconfig.base.json).
- [Protocol schemas/types](../../shared/src/protocol/protocol.ts).
- [Typed bus](../../shared/src/events.ts).
- [Compile-time contracts](../../client/src/type-contracts.ts).

## Demonstrate

- Run `npm run typecheck`; explain one intentionally rejected type-contract example.
- Show a malformed input rejected by a schema test.
- Describe actual migration findings: nullable Canvas context, uncertain DOM targets, missing World lookup results.

## Teacher questions

- **Why is a type assertion insufficient?** It changes compiler assumptions, not received data.
- **Why separate typecheck from Vite?** Transpilation/building does not perform full typechecking.
- **What does a brand prevent?** Accidentally passing a Tick where an EntityId is required.
- **Why keep vanilla UI?** A framework was optional; typed model/view separation already covered these small panels.
- **Version detail:** `lab-06` has four justified const assertions and zero explicit any types; current HEAD has six const assertions.

[Reflection answers](../reflections/lab-06-answers.md) · [Demo](../demo-guides/lab-06.md) · [Next lab](lab-07.md)
