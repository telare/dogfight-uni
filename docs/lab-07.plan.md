# Lab 07 completion plan

The implementation and measurements from this plan are complete locally. See [the visible TODO](../TODO.md) for current status and [the report](lab-07.report.md) for validation, measured results and limitations.

- [x] Migrate all earlier tests to Vitest and add simulation, property, reconciliation and fake-timer cases.
- [x] Verify the two-browser roster/movement/chat flow and enable recommended type-aware lint.
- [x] Configure GitHub Actions with coverage, build, Chromium E2E and a README badge.
- [x] Implement all benchmark scripts and save actual before/after CPU, heap, GC and frame samples.
- [x] Apply measured render/interpolation/fan-out improvements and retain a reversible variant patch.
- [x] Validate bots, compare synchronous/clone/transfer replay decoding, and ramp real clients through 128.
- [x] Write the report, whiteboard reflections and reproduction commands.
- [ ] Verify remote GitHub Actions after the completed work is pushed.

The strict zero-major-GC / frame-p99-under-16.7-ms target is not claimed; the report records the actual values and limitations of this instrumented headless machine. The measured capacity is a lower bound because the prescribed ramp does not saturate the server. Optional stretch exercises remain outside this lab.
