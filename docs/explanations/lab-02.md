# Lab 02 — entities, classes and composition

## Checkout and run

- Run from `D:\uni\4th\js` with Node.js 22.
- Stop the previous server with **Ctrl+C** and save local changes before switching.
- Version: `lab-02` (commit `f694fb9`).

```powershell
git checkout lab-02
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. Keep the server terminal running.

- **Say first:** “The World owns game entities and coordinates updates, collisions and removal.”
- **React connection:** simulation is domain logic outside the UI. Its objects can mutate without calling `setState`.

## Explain in order

1. **Vector2:** stores coordinates and supports operations. Pure `add` returns a new vector.
2. **Entity:** provides identity, position, velocity and lifecycle state.
3. **Ship:** extends Entity with controls, health and firing.
4. **World:** stores entities in a Map keyed by ID; supports lookup and iteration.
5. **Fire:** check cooldown → calculate muzzle position/velocity → create Bullet → spawn in World.
6. **Step:** update live entities → wrap → resolve collisions → sweep dead entities → update respawn timers.
7. **Composition:** share homing behavior between bullets and asteroids without duplicating deep subclasses.

```text
fire input → Ship.fire → World.spawn(Bullet)
collision → damage → dead state → sweep / respawn
```

## Open these files

- [Vector2](../../shared/src/sim/vector.ts), [Entity](../../shared/src/sim/entity.ts).
- [Ship](../../shared/src/sim/ship.ts): `fire`, private HP, cooldown.
- [World](../../shared/src/sim/world.ts): `spawn`, `despawn`, `step`.
- [Collision](../../shared/src/sim/collision.ts) and [composition behaviors](../../shared/src/sim/components.ts).
- Historical Lab 02 uses `src/sim/*.js` and includes an Explosion particle entity absent from the current shared union.

## Demonstrate

- Show firing, damage, pickups and respawn at `lab-02`.
- Explain the detached-method bug: `const fire = ship.fire` loses the original receiver.
- Show the wrapper fix: `() => ship.fire(world)`.

## Teacher questions

- **Why Map?** Typed keys, direct iteration, built-in size/deletion and no inherited property-name collisions.
- **Why defer deletion?** Mark dead now; remove in a controlled lifecycle phase.
- **Why composition?** Homing is reusable behavior shared by otherwise different entity types.
- **Why this bug?** Ordinary methods obtain `this` from their call, not their declaration.

[Reflection answers](../reflections/lab-02-answers.md) · [Demo](../demo-guides/lab-02.md) · [Next lab](lab-03.md)
