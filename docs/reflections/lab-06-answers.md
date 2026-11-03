# Lab 6 — TypeScript: answers

Numbers match the [original questions](questions.md#lab-6--typescript). Project-specific answers were checked against the code, archived migration report and `lab-06` tag on 2026-11-03.

## 1. Structural typing

**Question:** What does "structural typing" mean? Give an example where two unrelated classes are interchangeable in TypeScript and would not be in C# or Java.

**Answer:**

Compatibility depends on members rather than declared ancestry.

```ts
class Ship { x = 0; y = 0 }
class Asteroid { x = 1; y = 1 }
const position: Ship = new Asteroid() // Same public structure
```

Java and C# would require an explicit inheritance/interface relationship for comparable class assignment. TypeScript private/protected members can restrict otherwise structural compatibility.

## 2. `any` and `unknown`

**Question:** `any` vs `unknown` — what can you do with each? Where does `unknown` enter your system, and how does it leave?

**Answer:**

`any` permits unchecked property access, calls, and assignments; errors can spread through dependent code. `unknown` accepts any value but requires narrowing before using its contents. Annotate parsed network data as `unknown`, validate it at the boundary, then pass the validated typed value into the simulation. `JSON.parse` itself returns `any`, so that annotation is deliberate.

## 3. Discriminated union and exhaustive handling

**Question:** Write a discriminated union for three message types and a handler with an exhaustive `switch`. What exactly does the `never` default catch, and when?

**Answer:**

```ts
type Message =
  | { type: 'input'; turn: number }
  | { type: 'chat'; text: string }
  | { type: 'ping'; sentAt: number }

function handle(message: Message): string {
  switch (message.type) {
    case 'input': return `Turn: ${message.turn}`
    case 'chat': return message.text
    case 'ping': return `Ping: ${message.sentAt}`
    default: {
      const unhandled: never = message
      throw new Error(`Unhandled message: ${String(unhandled)}`)
    }
  }
}
```

Adding a union member without handling it makes the `never` assignment fail **during type-checking**. It does not validate network data at runtime. See [TypeScript exhaustiveness checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking).

## 4. Runtime validation

**Question:** Types are erased at runtime — so what stops a malicious client sending `{ type: "input", turn: 1e9 }`? Where does that check live and why there?

**Answer:**

A server-side parser/schema rejects non-finite or out-of-range inputs, for example requiring `turn` to be between -1 and 1. Run it immediately after decoding, before dispatch or simulation. TypeScript types are erased and clients are untrusted; a type assertion cannot enforce this rule.

## 5. Branded types

**Question:** What is a branded type? Show the definition and a bug it prevents in your code.

**Answer:**

A brand distinguishes values that share the same runtime representation. This project uses Zod numeric brands, rather than distinct string player/room IDs:

```ts
const EntityIdSchema = z.number().int().positive().max(0xffff).brand<'EntityId'>()
type EntityId = z.infer<typeof EntityIdSchema>
// Tick and Seq have separate brands in the same protocol module.
world.get(asEntityId(1)) // Entity lookup accepts the EntityId brand.
// world.get(asTick(1)) // Type error: Tick is not EntityId.
```

`asEntityId`, `asTick` and `asSeq` validate through their schemas. [Type contracts](../../client/src/type-contracts.ts) exercise rejected brand substitutions. Brands alone perform no runtime checks.

## 6. Generics and a typed event bus

**Question:** When should a function be generic? Show your typed event bus and explain how `K extends keyof E` and `E[K]` link the name to the payload.

**Answer:**

Use a generic when an operation preserves a relationship between types, such as an event name determining its payload.

```ts
class Bus<E extends Record<string, unknown>> {
  #listeners: { [K in keyof E]?: Set<(payload: E[K]) => void> } = {}
  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    let listeners = this.#listeners[name]
    if (!listeners) {
      listeners = new Set()
      this.#listeners[name] = listeners
    }
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }
  emit<K extends keyof E>(name: K, payload: E[K]): void {
    for (const listener of this.#listeners[name] ?? []) listener(payload)
  }
}
const bus = new Bus<{ chat: { text: string } }>()
bus.emit('chat', { text: 'Hello' })
// bus.emit('chat', { playerId: 'p1' }) // Type error
```

This is the relationship used by [shared Bus](../../shared/src/events.ts). `K extends keyof E` restricts names to event keys; `E[K]` selects the corresponding payload. The mapped listener store preserves that relationship without casts. The client derives `GameEvents` from the server-message union.

## 7. Vite and type-checking

**Question:** Why does Vite not type-check? How do you get checking anyway, and where does it run?

**Answer:**

Vite transpiles TypeScript quickly without performing whole-program type-checking. Run `tsc --noEmit` separately, use `tsc --noEmit --watch` during development, and require checking in CI before building/deploying. For a project-reference setup, use the repository's appropriate `tsc -b` check. See [Vite's TypeScript documentation](https://vite.dev/guide/features.html#typescript).

## 8. Migration bugs

**Question:** Name three bugs TypeScript found in your migration. Were any of them *not* type errors in the naive sense (e.g., a missing `undefined` check)?

**Answer:**

The [archived migration report](../lab-reports.md) records these concrete findings, all reflected in source:

- [Canvas setup](../../client/src/render/canvas.ts): `getContext('2d')` can return null; initialization now checks before use.
- [Netgraph](../../client/src/ui/netgraph.ts): event targets can be null or an unsuitable element; handlers narrow through `instanceof` before reading DOM properties.
- [Collision rules](../../shared/src/sim/collision.ts): owner lookup through `world.get()` can be undefined; scoring checks the owner and entity kind.

These expose assumptions about missing values and runtime structure, not just primitive type mismatches. The report is preserved migration history; this audit did not replay the migration or claim a fresh compiler error from already-fixed code.

## 9. Acceptable assertions

**Question:** When is `as` acceptable? Explain each of your casts.

**Answer:**

Use an assertion only when its invariant is established independently; prefer narrowing, generics or `satisfies`. At `lab-06`, all **four assertions are `as const`**, with adjacent comments:

- [Binary specification](../../shared/src/codec/spec.ts): preserves immutable layout literal types, including `LITTLE_ENDIAN: true`.
- [Protocol](../../shared/src/protocol/protocol.ts): `CloseCode`, `ClientMessageType` and `ServerMessageType` each preserve literal values for typed close codes and exhaustive message dispatch.

The `satisfies` checks verify the map shapes without widening those literals. Brands are produced by schema validation, not `as` casts. A mapped-type key remap (`as M['type']`) and an import alias (`config as serverConfig`) are not assertions.

At the audited Lab 08 HEAD, [metrics](../../server/src/metrics.ts) adds two `as const` tuple assertions so counter keys retain their finite union. That makes **six assertions in current production source**, all const assertions: the historical Lab 06 tag meets the fewer-than-five requirement, while current HEAD exceeds that literal count. Do not claim the current total is four. The audit found zero explicit `any` type nodes in production TypeScript.
