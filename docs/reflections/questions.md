# JavaScript labs 1–6: reflection questions

Extracted from the Reflection sections linked in the [course README](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/README.md). Original wording and numbering are preserved, including Lab 2's optional questions. Total: **51 questions**.

## Lab 1 — The Event Loop Is the Game Loop

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-01-event-loop-and-game-loop.md) · [Answers](lab-01-answers.md)

1. Draw the runtime: call stack, heap, Web APIs, task queue, microtask queue, render steps. Trace `setTimeout(f, 0); Promise.resolve().then(g);` through it.
2. Why does a 100 ms synchronous loop freeze the whole page, including CSS animations and scrolling in many cases? What *can't* JavaScript do about it from the same thread?
3. Microtasks vs tasks: state the rule for when each runs. Why can a microtask chain starve rendering while a `setTimeout` chain can't?
4. Where does `requestAnimationFrame` run relative to tasks, microtasks, and paint? Why is it better than `setInterval(fn, 16)` for animation — give three reasons.
5. Explain the accumulator loop. Why clamp the frame delta? What is `alpha` and what does the renderer do with it?
6. Why must the simulation be deterministic, and what does that have to do with multiplayer (Lab 5)?
7. What does a closure capture — values or variables? Show the `var`/`let` loop difference and explain it precisely.
8. What changes when you add `type="module"` to a script tag? Name five things.

## Lab 2 — Objects, Prototypes, and `this`

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-02-objects-prototypes-classes.md) · [Answers](lab-02-answers.md)

Defense: pick 2–3 from the first four. The rest is extra.

1. State the four `this` rules in precedence order. What's `this` in `setTimeout(ship.fire, 100)`? Give three fixes and one downside of each.
2. Why do arrow functions ignore `.bind`? What are they good for, and where are they the wrong choice for a method shared by many instances?
3. Why `Map` over a plain object for the entity store? Give three concrete reasons.
4. Argue for composition over inheritance using your homing-bullet-and-homing-asteroid case. What would the hierarchy have had to look like?

Optional, if you went into Stretch:

5. Draw the prototype chain for `const s = new Ship()` where `class Ship extends Entity`. What does `s.update` do, step by step?
6. What exactly does `new` do? Write `new` as a function using `Object.create` and `.call`.
7. Why do people say `class` is "just sugar"? Name three things `class` does that the constructor-function version doesn't.
8. What is an iterable? Why could `[...world]` be a problem in a game loop?

## Lab 3 — Asynchronous JavaScript

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-03-async-javascript.md) · [Answers](lab-03-answers.md)

1. The three promise states and the transitions. Why does `.then` on an already-fulfilled promise still run asynchronously, and as which kind of task?
2. Desugar `async function f() { const a = await g(); return a + 1; }` into `.then` calls. Where exactly does the function return control to the event loop?
3. Predict: `setTimeout(log1); Promise.resolve().then(log2).then(log3); (async () => { log4; await 0; log5 })(); log6`. Explain every position.
4. `Promise.all` vs `allSettled` vs `race` vs `any` — one use case each from your game. What happens to the *other* promises when `all` rejects?
5. Why doesn't `fetch` reject on a 404? What's the two-step nature of reading a response, and why?
6. How does `AbortController` implement cancellation without the promise having a cancel method? How do you make *your own* async function cancellable?
7. Promise vs event: when is each the right tool? Show converting one into the other.
8. What happens to an unhandled rejection in the browser? In Node? Why is that difference deliberate?

## Lab 4 — Node.js: The Other Runtime

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-04-node-streams-websockets.md) · [Answers](lab-04-answers.md)

1. Draw the Node event loop phases. Where do `setTimeout`, `setImmediate`, `process.nextTick`, and promise reactions run? Why is `setTimeout(0)` vs `setImmediate` order unstable from the main module?
2. Node is single-threaded — so how does it read a file without blocking? What does libuv's thread pool handle, and what does it not?
3. CommonJS vs ESM: three differences. What is `import.meta.dirname` replacing?
4. What is backpressure? Show what `write()` returning `false` means and what happens if you ignore it. How does `pipeline` handle it?
5. What's the difference between a Readable, Writable, Duplex, and Transform? Which one is a TCP socket?
6. Walk through the WebSocket handshake. Why does a game use WebSockets rather than polling or SSE?
7. Why must every `EventEmitter` that can fail have an `"error"` listener? What happens otherwise, and what's the equivalent failure for promises in Node?
8. A client is on a 2G connection and your server sends 30 snapshots/s. What happens in the server's memory, how do you detect it, and what are your options?
9. Why validate every incoming message's shape on the server even though you wrote the client?

## Lab 5 — Real-Time Networking

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-05-realtime-networking.md) · [Answers](lab-05-answers.md)

1. Why must the server be authoritative? Name the two problems a client-authoritative design has, with a concrete exploit for one of them.
2. Explain client-side prediction. What property of the simulation does it depend on, and how would you *detect* that property being violated?
3. Walk through reconciliation with a diagram: client at tick 104, snapshot for tick 100 arrives acknowledging `seq` 57, buffer holds `seq` 55–61. What happens, step by step?
4. Why interpolate remote entities *in the past*? What does the interpolation delay trade off, and what value did you choose?
5. What is lag compensation, and why does interpolation make it necessary?
6. `DataView` vs a `Float32Array` view — when is each right? Why does endianness matter for a protocol and not for a local typed array?
7. Your binary snapshot quantizes the angle to `Int16`. What's the precision, and how did you decide it was enough?
8. Why not `setInterval` for the server tick? What does the absolute-target scheme fix, and what happens when a tick overruns?
9. What would break if the sim used `Math.random()`? Iterated a `Set` of entities? Used `Date.now()`?

## Lab 6 — TypeScript

[Source](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-06-typescript.md) · [Answers](lab-06-answers.md)

1. What does "structural typing" mean? Give an example where two unrelated classes are interchangeable in TypeScript and would not be in C# or Java.
2. `any` vs `unknown` — what can you do with each? Where does `unknown` enter your system, and how does it leave?
3. Write a discriminated union for three message types and a handler with an exhaustive `switch`. What exactly does the `never` default catch, and when?
4. Types are erased at runtime — so what stops a malicious client sending `{ type: "input", turn: 1e9 }`? Where does that check live and why there?
5. What is a branded type? Show the definition and a bug it prevents in your code.
6. When should a function be generic? Show your typed event bus and explain how `K extends keyof E` and `E[K]` link the name to the payload.
7. Why does Vite not type-check? How do you get checking anyway, and where does it run?
8. Name three bugs TypeScript found in your migration. Were any of them *not* type errors in the naive sense (e.g., a missing `undefined` check)?
9. When is `as` acceptable? Explain each of your casts.


## Lab 7 - Engine Performance and Testing

1. Draw V8's pipeline: parser → Ignition → (Maglev) → TurboFan. What triggers optimization? What triggers a deopt? Give an example from your code.
2. What is a hidden class / shape? Why is `obj.x` fast when a call site sees one shape and slow when it sees twenty? What does that mean for how you write constructors?
3. Explain generational GC. Why are young-generation collections cheap and old-generation ones expensive? Why does a *long-lived* particle cause more trouble than a short-lived one?
4. What did the profiler show as your top allocator, and what did you do about it? What's the downside of object pooling?
5. Why are typed arrays faster than arrays of objects for bulk numeric state? Name two things you lose.
6. Web Workers: three ways to move data across, with their costs. Why did your worker experiment win or lose?
7. Property-based test vs example test — when is each better? Show your codec round-trip property and explain shrinking.
8. Why is `no-floating-promises` important in a server? What bug does it prevent?
9. Your load test found capacity N. What was the bottleneck — CPU in the tick, bandwidth, or GC — and how do you know?


## Lab 8 - Ship It

1. Walk through what your process does between receiving `SIGTERM` and exiting. Why does `CMD npm start` break this? Why does ignoring `SIGTERM` drop players?
2. Why is a WebSocket server harder to scale horizontally than a REST API? Describe sticky sessions and the Redis pub/sub design. Which did you ship and why?
3. Why must the client use `wss://`? Where is TLS terminated in your deployment, and what does that mean for the proxy's WebSocket support and idle timeouts?
4. CORS doesn't apply to WebSockets — so what stops another site's page from connecting to your server as its visitors? Where do you check it?
5. Liveness vs readiness — what does each answer, and what does the platform do differently with each?
6. Why structured JSON logs to stdout rather than formatted text to a file? Why does `pino` move formatting off the main thread — which lab's lesson is that?
7. Multi-stage Docker build: what's in stage 1 that must not be in stage 2, and why? Why copy `package*.json` before the source?
8. Your load test said capacity N. A stranger's RTT was X ms. Put those two numbers together: how many concurrent players in Europe can your one instance serve well, and what would you change first?
9. If the server crashes at 3 a.m., how do you find out, and what do you look at first?
