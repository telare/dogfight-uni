# Lab 6 — TypeScript: answers

Numbers match the [original questions](questions.md#lab-6--typescript). Code and migration examples are illustrative; project-specific questions require your actual findings and casts.

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

A brand distinguishes values that share the same runtime representation.

```ts
declare const playerIdBrand: unique symbol
declare const roomIdBrand: unique symbol
type PlayerId = string & { readonly [playerIdBrand]: true }
type RoomId = string & { readonly [roomIdBrand]: true }
declare function kickPlayer(id: PlayerId): void
declare const room: RoomId
// kickPlayer(room) // Type error: a room ID is not a player ID.
```

Create branded values through validated constructors; brands alone perform no runtime checks.

## 6. Generics and a typed event bus

**Question:** When should a function be generic? Show your typed event bus and explain how `K extends keyof E` and `E[K]` link the name to the payload.

**Answer:**

Use a generic when an operation preserves a relationship between types, such as an event name determining its payload.

```ts
type Events = {
  joined: { playerId: PlayerId }
  chat: { text: string }
}

function createBus<E>() {
  type Listeners = { [K in keyof E]?: Set<(payload: E[K]) => void> }
  const listeners: Listeners = {}
  return {
    on<K extends keyof E>(name: K, listener: (payload: E[K]) => void) {
      const set = (listeners[name] ??= new Set<(payload: E[K]) => void>())
      set.add(listener)
      return () => { set.delete(listener) }
    },
    emit<K extends keyof E>(name: K, payload: E[K]) {
      listeners[name]?.forEach(listener => listener(payload))
    },
  }
}

const bus = createBus<Events>()
bus.emit('chat', { text: 'Hello' })
// bus.emit('chat', { playerId: 'p1' }) // Type error
```

`K extends keyof E` restricts names to event keys; `E[K]` selects the corresponding payload. The mapped listener store preserves that relationship without casts.

## 7. Vite and type-checking

**Question:** Why does Vite not type-check? How do you get checking anyway, and where does it run?

**Answer:**

Vite transpiles TypeScript quickly without performing whole-program type-checking. Run `tsc --noEmit` separately, use `tsc --noEmit --watch` during development, and require checking in CI before building/deploying. For a project-reference setup, use the repository's appropriate `tsc -b` check. See [Vite's TypeScript documentation](https://vite.dev/guide/features.html#typescript).

## 8. Migration bugs

**Question:** Name three bugs TypeScript found in your migration. Were any of them *not* type errors in the naive sense (e.g., a missing `undefined` check)?

**Answer:**

**Illustrative examples, not verified migration history:** a misspelled message field; a missing union case in a handler; and dereferencing `entities.get(id)` without handling `undefined`. The last two reveal missing behavior or assumptions, beyond simply passing a string where a number belongs. Replace these with actual compiler findings for your defense.

## 9. Acceptable assertions

**Question:** When is `as` acceptable? Explain each of your casts.

**Answer:**

Use `as` only when external evidence establishes something TypeScript cannot infer. Examples: branding an ID immediately after validation; narrowing a canvas element after checking the actual DOM; or an interoperability boundary whose contract has been verified. Prefer narrowing, generics, or `satisfies` where possible. For each actual cast, explain the invariant and where it is enforced; avoid `as any` or double assertions used merely to silence errors.
