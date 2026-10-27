# Lab 07 completion plan

Based on `lab-07.md` and the current working tree. This plan was prepared on 2026-10-27 through read-only inspection; checks have not been rerun. The biggest remaining task is collecting reproducible performance evidence.

## Current state

| Area | What exists | What remains |
| --- | --- | --- |
| Tests | Vitest, five property tests, fake timers; saved log reports 95 passes and >85% shared coverage | Fresh verification and stronger assertions |
| E2E / CI | Two-context multiplayer test and CI workflow | Resolve the last recorded E2E failure; verify CI |
| Performance | Timing spans, bullet pooling, reused interpolation objects | Before/after measurements, profiles, screenshots |
| Bots / worker | Bot AI, API endpoint, transferable replay-worker experiment | Validate behavior and measure worker benefit |
| Load testing | npm commands declared | Referenced benchmark scripts are missing |
| Submission | Lab requirements and notes | Updated README, report, reflections, tag |

## 1. Verify the current baseline

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test:coverage`.
- [ ] Run `npm run build`, then `npm run test:e2e`.
- [ ] Inspect the recorded Playwright failure and fix its cause.
- [ ] Preserve existing uncommitted work and confirm removed tests are covered by their replacements.

## 2. Finish M1: strengthen test coverage

- [ ] Make malformed-buffer tests distinguish expected decoding errors from unexpected failures; accepting any `Error` is too broad.
- [ ] Generate invalid message fields and boundary values, beyond changing the discriminator.
- [ ] Extract reconciliation into a pure state transformation and assert expected results; the current test compares two identical executions.
- [ ] Verify touching, overlapping, missing, and tunneling collision cases explicitly.
- [ ] Confirm at least 60 tests, at least five meaningful fast-check properties, shared coverage of at least 85%, and passing accumulator/heartbeat fake-timer tests.

## 3. Finish M2: E2E and CI

- [ ] Verify both clients join the same room, see the roster, observe movement within 500 ms, and receive chat.
- [ ] Enable the full type-checked ESLint recommended rules and resolve findings.
- [ ] Add the CI badge to the README.
- [ ] Verify the workflow succeeds on GitHub once pushed: typecheck, lint, coverage, build, E2E.

## 4. Complete the measurement tooling

- [ ] Implement the missing scripts referenced by `bench:load`, `bench:sim`, `bench:browser`, and `bench:suite`:
  - `scripts/load-test.js`
  - `scripts/profile-simulation.js`
  - `scripts/profile-browser.js`
  - `scripts/measure-lab07.js`
- [ ] Save raw samples and environment details under `docs/performance/`.
- [ ] Ensure timing instrumentation is enabled during captures.
- [ ] Use consistent warm-up and sampling windows.

## 5. Finish M3: profile and justify optimizations

Establish a reproducible baseline using an isolated version before the current optimizations, with the same bots and workload. Do this before making further optimizations so the before/after comparison can be defended.

- [ ] Record a 30-second browser session with eight bots and heavy shooting.
- [ ] Record frame p50/p95/p99, GC count/duration, top three allocators, and top three self-time functions.
- [ ] Capture flame-chart screenshots.
- [ ] Record and analyze a 60-second server CPU profile.
- [ ] Compare the baseline against current pooling and allocation changes.
- [ ] Make further changes only where profiles justify them, then repeat measurements.
- [ ] Document server tick p99 before/after.
- [ ] Achieve zero major GCs and frame p99 below 16.7 ms, or document a precise measured explanation of the machine's limit.

## 6. Finish M4: worker and capacity experiments

- [ ] Validate bot chasing, evasion, firing, and endpoint limits.
- [ ] Run the existing synchronous/clone/transfer replay comparison.
- [ ] Report main-thread cost, preparation, messaging overhead, and correctness; state the worker go/no-go decision.
- [ ] Load-test 8, 32, 64, and 128 WebSocket clients.
- [ ] Record tick p99, interval event-loop utilization, RSS, and bytes/s at each load.
- [ ] Chart capacity against the 33 ms tick budget and identify the bottleneck.
- [ ] If the tested range never crosses the budget, report the measured lower bound on capacity or extend the ramp to locate the crossing.

## 7. Prepare the submission

- [ ] Update the README's outdated six-lab description and Node-test-runner instructions.
- [ ] Add performance tables, screenshots, worker decision, capacity chart, and reproduction commands.
- [ ] Answer all nine Lab 07 reflection questions using the project's measured results.
- [ ] Complete the deliverable checklist in `lab-07.md`.
- [ ] Run the final checks: typecheck, lint, coverage, build, E2E.
- [ ] Commit the completed work and create the `lab-07` tag.

The stretch exercises are optional and outside the required completion path.
