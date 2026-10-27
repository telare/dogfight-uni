# Lab 1 — The Event Loop Is the Game Loop: answers

Numbers match the [original questions](questions.md#lab-1--the-event-loop-is-the-game-loop).

## 1. Runtime and callback order

**Question:** Draw the runtime: call stack, heap, Web APIs, task queue, microtask queue, render steps. Trace `setTimeout(f, 0); Promise.resolve().then(g);` through it.

**Answer:**

```text
Heap: objects referenced by executing code
Call stack → Web APIs (e.g. timer) → task queue → call stack
           → promise reaction → microtask queue → call stack
At a rendering opportunity: animation callbacks → layout/paint
```

`setTimeout(f, 0)` registers a timer; `.then(g)` queues a microtask. After current synchronous code finishes, microtasks run, so `g` precedes the timer task `f`. Rendering happens at browser-selected opportunities, not after every task.

## 2. Blocking the page

**Question:** Why does a 100 ms synchronous loop freeze the whole page, including CSS animations and scrolling in many cases? What *can't* JavaScript do about it from the same thread?

**Answer:**

A synchronous loop occupies the main thread, preventing it from handling input, running callbacks, or updating layout and paint. Some compositor animations and scrolling can continue independently. Code on that thread cannot interrupt the loop; split work across tasks or move computation to a Worker.

## 3. Tasks and microtasks

**Question:** Microtasks vs tasks: state the rule for when each runs. Why can a microtask chain starve rendering while a `setTimeout` chain can't?

**Answer:**

The browser runs a task, then drains microtasks, including newly queued ones, before proceeding. An endless microtask chain prevents that checkpoint from finishing. Chained timers create separate tasks, allowing rendering opportunities between them, although a long timer callback can still block.

## 4. `requestAnimationFrame`

**Question:** Where does `requestAnimationFrame` run relative to tasks, microtasks, and paint? Why is it better than `setInterval(fn, 16)` for animation — give three reasons.

**Answer:**

Callbacks run during a rendering update, before paint, normally after the preceding task's microtasks drain; callbacks can also cause microtask checkpoints. Three benefits: alignment with display refresh, a timestamp for time-based animation, and pausing in most background tabs. A 16 ms interval offers none of these guarantees.

## 5. Accumulator loop

**Question:** Explain the accumulator loop. Why clamp the frame delta? What is `alpha` and what does the renderer do with it?

**Answer:**

Add elapsed frame time to an accumulator; while it contains at least one fixed `dt`, simulate one step and subtract `dt`. Clamp large frame deltas to prevent excessive catch-up after a pause. `alpha = accumulator / dt`; render between previous and current states using `previous * (1 - alpha) + current * alpha`.

## 6. Determinism

**Question:** Why must the simulation be deterministic, and what does that have to do with multiplayer (Lab 5)?

**Answer:**

The same initial state and ordered inputs should produce the same state at each fixed tick. This makes replay and testing reliable. In multiplayer, the client can replay unacknowledged inputs after a server correction without introducing avoidable divergence.

## 7. Closure capture

**Question:** What does a closure capture — values or variables? Show the `var`/`let` loop difference and explain it precisely.

**Answer:**

Closures retain access to variable bindings, not frozen copies of their values.

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i), 0)
// 3, 3, 3: one shared binding, already incremented to 3
for (let j = 0; j < 3; j++) setTimeout(() => console.log(j), 0)
// 0, 1, 2: a separate binding for each iteration
```

## 8. Module scripts

**Question:** What changes when you add `type="module"` to a script tag? Name five things.

**Answer:**

Five changes: `import`/`export` become available; strict mode is automatic; top-level declarations have module scope; top-level `this` is `undefined`; and scripts defer by default until parsing and dependency loading finish, unless marked `async`.
