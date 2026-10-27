# Lab 4 — Node.js: The Other Runtime: answers

Numbers match the [original questions](questions.md#lab-4--nodejs-the-other-runtime).

## 1. Event loop phases

**Question:** Draw the Node event loop phases. Where do `setTimeout`, `setImmediate`, `process.nextTick`, and promise reactions run? Why is `setTimeout(0)` vs `setImmediate` order unstable from the main module?

**Answer:**

```text
timers → pending callbacks → idle/prepare → poll → check → close callbacks
   ↑___________________________________________________________|
```

This is a conceptual cycle; modern libuv runs timers after poll. Timers handle `setTimeout`; check handles `setImmediate`. `process.nextTick` and promise reactions use separate queues drained at callback boundaries, rather than their own phases. Normally next-tick callbacks precede promise microtasks; top-level ESM execution can reverse the observed order. From the main module, timeout eligibility and reaching check depend on timing; inside an I/O callback, an immediate runs before a newly scheduled timer. See [Node's event loop guide](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick).

## 2. Nonblocking I/O

**Question:** Node is single-threaded — so how does it read a file without blocking? What does libuv's thread pool handle, and what does it not?

**Answer:**

The main JavaScript thread initiates asynchronous work and handles completion later. libuv's worker pool handles most asynchronous filesystem operations, `dns.lookup`, and selected crypto/compression operations. Network sockets normally use OS readiness mechanisms instead. Ordinary JavaScript computation is not automatically sent to the pool; use Worker Threads for CPU-heavy code.

## 3. CommonJS and ESM

**Question:** CommonJS vs ESM: three differences. What is `import.meta.dirname` replacing?

**Answer:**

Three differences: CommonJS uses `require`/`module.exports`, ESM uses `import`/`export`; CommonJS loading is ordinarily synchronous, while ESM supports asynchronous graph evaluation and top-level `await`; ESM imports are live bindings, while CommonJS exposes an exports value. In file-based Node ESM, `import.meta.dirname` replaces CommonJS's `__dirname`, or the older `fileURLToPath` plus `dirname` workaround.

## 4. Backpressure

**Question:** What is backpressure? Show what `write()` returning `false` means and what happens if you ignore it. How does `pipeline` handle it?

**Answer:**

Backpressure makes a producer respect a slower consumer. `write(chunk) === false` means the chunk was accepted but buffering reached its threshold; pause further writes until `drain`. Ignoring it grows memory and latency. Node's `pipeline` coordinates stream flow and propagates errors with cleanup.

```js
if (!output.write(chunk)) await once(output, 'drain')
// once is imported from node:events; also handle stream failure/closure.
```

## 5. Stream types

**Question:** What's the difference between a Readable, Writable, Duplex, and Transform? Which one is a TCP socket?

**Answer:**

Readable produces data; Writable consumes it; Duplex does both independently; Transform is a Duplex whose output derives from its input, such as compression. A TCP socket is Duplex because sending and receiving are independent.

## 6. WebSocket handshake

**Question:** Walk through the WebSocket handshake. Why does a game use WebSockets rather than polling or SSE?

**Answer:**

For the usual HTTP/1.1 handshake, the client sends an Upgrade request with WebSocket version and a random `Sec-WebSocket-Key`. The server validates it and returns `101 Switching Protocols` plus `Sec-WebSocket-Accept`, derived from the key and protocol GUID. The connection then carries WebSocket frames. Games need persistent, low-latency, bidirectional messages; polling adds request overhead, while SSE supplies only server-to-client events.

## 7. Error handling

**Question:** Why must every `EventEmitter` that can fail have an `"error"` listener? What happens otherwise, and what's the equivalent failure for promises in Node?

**Answer:**

Emitting `error` without a registered listener throws; if uncaught, Node exits. Register a listener that handles or propagates the failure. The analogous promise mistake is leaving a rejection without a handler, which also normally terminates modern Node under its default policy. See [Node's rejection behavior](https://nodejs.org/api/process.html#event-unhandledrejection).

## 8. Slow clients

**Question:** A client is on a 2G connection and your server sends 30 snapshots/s. What happens in the server's memory, how do you detect it, and what are your options?

**Answer:**

Outgoing data queues faster than the connection drains, growing memory and making snapshots increasingly stale. Monitor `ws.bufferedAmount`, queue limits, and connection health. Reduce snapshot frequency or size, skip replaceable snapshots before enqueueing, or disconnect clients that exceed limits. Data already queued on the reliable connection cannot simply be replaced by a newer snapshot.

## 9. Validate incoming messages

**Question:** Why validate every incoming message's shape on the server even though you wrote the client?

**Answer:**

Anyone can replace or modify the client and send arbitrary data. Validate message type, payload size, field types, finite numbers, ranges, permissions, and rate limits before changing game state. This protects the shared server from malformed traffic and cheating.
