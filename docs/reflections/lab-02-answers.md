# Lab 2 — Objects, Prototypes, and `this`: answers

Numbers match the [original questions](questions.md#lab-2--objects-prototypes-and-this). Questions 5–8 are optional in the source.

## 1. `this` rules and callbacks

**Question:** State the four `this` rules in precedence order. What's `this` in `setTimeout(ship.fire, 100)`? Give three fixes and one downside of each.

**Answer:**

For ordinary functions: `new` binding > explicit `call`/`apply`/`bind` > receiver binding (`ship.fire()`) > default binding. A bound function called with `new` uses the newly created instance. Arrows instead capture lexical `this`.

`setTimeout(ship.fire, 100)` loses `ship` as the receiver. Browser timers normally use `window`; Node timers use a Timeout object. Fixes:

- `setTimeout(ship.fire.bind(ship), 100)`: allocates a bound function; save it if callback identity matters.
- `setTimeout(() => ship.fire(), 100)`: allocates a wrapper and retains the captured reference.
- Define `fire = () => { /* use this */ }` as a class field: creates a function per instance instead of one shared prototype method.

## 2. Arrow functions

**Question:** Why do arrow functions ignore `.bind`? What are they good for, and where are they the wrong choice for a method shared by many instances?

**Answer:**

Arrows have no own `this`; `bind` cannot replace the enclosing scope's `this`, though it can prefill arguments. They suit callbacks that need the surrounding instance. A prototype method is preferable when many instances can share one function and callers should supply the receiver.

## 3. Entity storage with `Map`

**Question:** Why `Map` over a plain object for the entity store? Give three concrete reasons.

**Answer:**

Three reasons: keys retain their types, so `1` and `"1"` differ; entries cannot collide with inherited names such as `constructor`; and `size`, deletion, and direct iteration are built in. It also preserves insertion order, which must still be controlled consistently across simulations.

## 4. Composition

**Question:** Argue for composition over inheritance using your homing-bullet-and-homing-asteroid case. What would the hierarchy have had to look like?

**Answer:**

Give bullets and asteroids a reusable homing behavior while keeping their movement and collision rules separate. A single inheritance tree would need duplicated homing code in `HomingBullet` and `HomingAsteroid`, or an awkward shared ancestor that mixes unrelated entity types. Composition combines capabilities without multiplying subclasses.

## 5. Prototype lookup

**Question:** Draw the prototype chain for `const s = new Ship()` where `class Ship extends Entity`. What does `s.update` do, step by step?

**Answer:**

```text
s → Ship.prototype → Entity.prototype → Object.prototype → null
```

For `s.update`, check `s` first, then each prototype until the property is found or the chain ends. `s.update(dt)` invokes the found method with `this === s`; lookup does not copy the method into `s`.

## 6. How `new` works

**Question:** What exactly does `new` do? Write `new` as a function using `Object.create` and `.call`.

**Answer:**

It creates an object linked to the constructor's prototype, invokes the constructor with that object as `this`, and returns the constructor's explicit object/function result or the created object.

```js
function newLike(Ctor, ...args) {
  const instance = Object.create(Ctor.prototype)
  const result = Ctor.call(instance, ...args)
  return result !== null &&
    (typeof result === 'object' || typeof result === 'function')
    ? result
    : instance
}
```

This demonstrates ordinary constructor functions; native classes cannot be invoked with `.call`. A general implementation uses `Reflect.construct`.

## 7. Classes and syntactic sugar

**Question:** Why do people say `class` is "just sugar"? Name three things `class` does that the constructor-function version doesn't.

**Answer:**

Classes use the same prototype-based object model. Three differences from a basic constructor-function implementation: class bodies are automatically strict; class constructors require `new`; and prototype methods are non-enumerable by default. These semantics mean the two spellings are not identical.

## 8. Iterables and allocations

**Question:** What is an iterable? Why could `[...world]` be a problem in a game loop?

**Answer:**

An iterable supplies `[Symbol.iterator]()` returning an iterator with `next()` results shaped as `{ value, done }`. `[...world]` consumes it into a new array. Doing that every frame creates allocation and garbage-collection pressure; directly iterate when a snapshot is unnecessary.
