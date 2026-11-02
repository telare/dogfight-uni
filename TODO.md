# Lab 07 TODO

Live checklist for [Lab 07](docs/lab-07.md). Results and reproduction commands: [Lab 07 report](docs/lab-07.report.md).

- [x] Inspect requirements and preserve existing work.
- [x] M1: 102 Vitest tests, seven fast-check properties, pure reconciliation and fake timers.
- [x] Shared coverage: 92.45% lines, 91.51% statements, 90.62% functions (85% enforced).
- [x] M2: two-browser roster/movement/chat E2E, type-aware lint, CI configuration and badge.
- [x] M3: timing spans, before/after profiles, flame-chart screenshots and measured optimizations.
- [x] M4: bots, transferable replay worker, separate-process WebSocket load ramp and capacity chart.
- [x] Report: actual measurements, reproduction commands, all nine reflections and updated README.
- [x] Final verification: typecheck, lint, coverage, build, E2E, complete benchmark command.
- [x] Local submission commit and `lab-07` tag.
- [ ] Confirm GitHub Actions after a push (remote publishing was not requested).

Measured exceptions are documented: frame p99 is about 16.8 ms and major GCs still occur. The 8/32/64/128 ramp establishes capacity of at least 128 clients; it does not locate saturation. Branch coverage is 77.21% and reported separately from the enforced line/statement/function thresholds.
