# Lab 7 - Engine Performance and Testing: answers

Questions match the official brief. These answers are indexed from the measured [Lab 07 report](../lab-07.report.md); historical measurements are retained. Current evidence and gaps are in the [all-labs audit](../labs-audit.md).

## 1. Draw V8's pipeline: parser → Ignition → (Maglev) → TurboFan. What triggers optimization? What triggers a deopt? Give an example from your code.

**Answer:** Source is parsed, compiled to Ignition bytecode and profiled; frequently used stable code can progress through available optimizing tiers (such as Maglev/TurboFan). Unexpected shapes/types or failed assumptions can deoptimize it. Ship movement consistently uses numeric Vector2 coordinates; assigning a string instead would invalidate that assumption. This is an illustrative deopt example, not a claim that a particular deopt was observed in the capture.

## 2. What is a hidden class / shape? Why is `obj.x` fast when a call site sees one shape and slow when it sees twenty? What does that mean for how you write constructors?

**Answer:** A shape describes property layout. An inline cache can specialize a property read for a small set of shapes; many layouts require more general lookup. Constructors initialize fields consistently. Pooled interpolation records are replaced when the entity kind changes, and star colors are initialized at construction rather than attached in the hot loop.

## 3. Explain generational GC. Why are young-generation collections cheap and old-generation ones expensive? Why does a *long-lived* particle cause more trouble than a short-lived one?

**Answer:** Generational GC exploits the fact that many objects die young. A scavenge copies surviving young objects; old-generation collection traverses a larger retained graph and can require longer work. A particle that survives promotion becomes old-generation work, unlike a short-lived temporary. Actual pause behavior depends on incremental/concurrent collection and workload.

## 4. What did the profiler show as your top allocator, and what did you do about it? What's the downside of object pooling?

**Answer:** The largest named baseline allocator was drawStarfield; caching its static strings removes those repeated allocations. Interpolation was another major allocator and now reuses render records. Pooling costs retained memory, reset discipline and aliasing risk; stale pooled records must not survive entity disappearance.

## 5. Why are typed arrays faster than arrays of objects for bulk numeric state? Name two things you lose.

**Answer:** Typed arrays give dense numeric storage with fixed element representation and less object allocation. They lose convenient per-record object identity/methods and flexible heterogeneous fields; growth and deletion need explicit capacity/free-list management. The wire/replay experiments use ArrayBuffer and typed views without rewriting the whole simulation.

## 6. Web Workers: three ways to move data across, with their costs. Why did your worker experiment win or lose?

**Answer:** Structured clone copies data and preserves ownership; transfer moves a transferable buffer and detaches the sender; SharedArrayBuffer shares bytes and needs synchronization plus cross-origin isolation in browsers. The measured replay transfer keeps the main thread free, while cold worker startup is a visible total-latency cost.

## 7. Property-based test vs example test — when is each better? Show your codec round-trip property and explain shrinking.

**Answer:** Example tests pin down specific behavior (the seam, shield damage and known acceleration); properties explore broad domains. The input property decodes an encoded generated command and checks seq/tick/flags exactly and turn within 0.000501. fast-check shrinks failing inputs toward a small reproducible counterexample; a fixed seed makes reruns repeatable.

## 8. Why is `no-floating-promises` important in a server? What bug does it prevent?

**Answer:** A forgotten Promise rejection can escape an event handler and become an unhandled rejection in Node. Typed lint exposed asynchronous HTTP/signal callbacks and room destruction. The code now observes rejections through catches and a synchronous HTTP boundary, rather than silently leaving a request unresolved.

## 9. Your load test found capacity N. What was the bottleneck — CPU in the tick, bandwidth, or GC — and how do you know?

**Answer:** Capacity is a measured lower bound, not an invented exact N: all 128 clients remained connected below the tick budget. The eight-bot CPU profile justified reducing repeated encoding. Neither that small profile nor the unsaturated load ramp proves the eventual capacity bottleneck; identifying it requires extending the ramp and profiling near the budget crossing.
