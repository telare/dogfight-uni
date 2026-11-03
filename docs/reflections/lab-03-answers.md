# Lab 3 — Asynchronous JavaScript: answers

Numbers match the [original questions](questions.md#lab-3--asynchronous-javascript).

## 1. Promise states

**Question:** The three promise states and the transitions. Why does `.then` on an already-fulfilled promise still run asynchronously, and as which kind of task?

**Answer:**

States are pending, fulfilled, and rejected. A pending promise can settle once as fulfilled or rejected; settled states never change. `.then` handlers always run as microtasks, even for an already-fulfilled promise, giving consistent ordering after current synchronous work.

## 2. Desugaring `await`

**Question:** Desugar `async function f() { const a = await g(); return a + 1; }` into `.then` calls. Where exactly does the function return control to the event loop?

**Answer:**

```js
function f() {
  try {
    return Promise.resolve(g()).then(a => a + 1)
  } catch (error) {
    return Promise.reject(error)
  }
}
```

`g()` starts synchronously. At `await`, the async function suspends and returns a promise to its caller; its continuation runs later as a microtask. The event loop regains control after the caller's remaining synchronous code finishes. The `try` also preserves rejection if `g()` throws synchronously.

## 3. Output order

**Question:** Predict: `setTimeout(log1); Promise.resolve().then(log2).then(log3); (async () => { log4; await 0; log5 })(); log6`. Explain every position.

**Answer:**

Treating each `logN` as a logging action, the order is **4, 6, 2, 5, 3, 1**. The async function starts synchronously (4), pauses at `await`, then outer code logs 6. The queued `log2` runs before the await continuation (5); finishing `log2` queues `log3` behind that continuation. The timer runs last. Literally writing `log4;` only evaluates a variable; actual logging needs a call.

## 4. Promise combinators

**Question:** `Promise.all` vs `allSettled` vs `race` vs `any` — one use case each from your game. What happens to the *other* promises when `all` rejects?

**Answer:**

- `all`: load every required sprite; reject when any required asset fails.
- `allSettled`: collect results for optional sounds, including failures.
- `race`: race a lobby request against a timeout; the first settlement wins.
- `any`: try asset mirrors; the first fulfillment wins, rejecting only if all fail.

These are game-related use cases, not a claim that all four combinators are currently used. The actual loader uses `Promise.all`; the current lobby timeout is implemented through abort signals rather than a timer promise race. Mirror loading and optional-sound `allSettled` are alternatives.

The other operations continue when `all` rejects or a race finishes. Cancel them explicitly with abort signals if supported.

## 5. Fetch responses

**Question:** Why doesn't `fetch` reject on a 404? What's the two-step nature of reading a response, and why?

**Answer:**

A 404 is a completed HTTP exchange, so check `response.ok` and throw when necessary. First, `await fetch(url)` obtains status and headers; then `await response.json()` consumes and parses the streamed body. Body delivery and parsing can fail separately.

## 6. Cancellation

**Question:** How does `AbortController` implement cancellation without the promise having a cancel method? How do you make *your own* async function cancellable?

**Answer:**

`AbortController.abort()` signals the underlying operation to stop; the operation usually rejects its promise. For a custom operation, accept a signal, check `signal.aborted` before starting, register an abort listener, stop resources on abort, and reject with `signal.reason`. Remove the listener on completion to avoid retained references.

## 7. Promises and events

**Question:** Promise vs event: when is each the right tool? Show converting one into the other.

**Answer:**

A promise represents one eventual result, such as loading an asset. Events represent repeated occurrences, such as incoming chat messages. Convert the next event into a promise:

```js
function nextEvent(target, name) {
  return new Promise(resolve => {
    target.addEventListener(name, resolve, { once: true })
  })
}
```

For production use, also handle cancellation or failure so the promise cannot wait forever.

## 8. Unhandled rejection

**Question:** What happens to an unhandled rejection in the browser? In Node? Why is that difference deliberate?

**Answer:**

Browsers dispatch `unhandledrejection` and normally report it in the console while the page continues. Modern Node defaults to treating an unhandled rejection as an uncaught exception, normally exiting with failure unless handling or flags change that policy. This supports service failure detection and restart; browsers prioritize keeping the page usable. See [Node's rejection behavior](https://nodejs.org/api/process.html#event-unhandledrejection).
