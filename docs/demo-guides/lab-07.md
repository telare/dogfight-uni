# Lab 07 demonstration

Read the [measured report](../lab-07.report.md), [reflection answers](../reflections/lab-07-answers.md) and [all-labs audit](../labs-audit.md#lab-07--testingperformance) first. The local `lab-07` tag has not been pushed as of the audit; an ordinary branch push does not publish tags.

Use an isolated checkout/worktree for historical demonstrations; do not replace a working tree with unsaved changes. The historical tag and current HEAD differ, especially in production limits and shared package runtime exports.

```sh
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
```

Show two pilots joining, remote movement within 500 ms and chat. Explain one property with tolerance/shrinking and one fake-timer test. Open the before/after flame-chart images, frame/GC tables and server hotspots in the report. Show the transferable replay worker decision and saved capacity chart.

For full historical remeasurement, follow the report's `bench:suite` procedure at the tag. Its baseline patch must only be reversed in a scratch checkout. At current HEAD the additional room/player/IP production caps affect old load scripts; do not silently compare different configurations to the historical measurements.

State the measured limits: major GC remains, frame p99 is 16.8 ms and the historical load ramp establishes at least 128 clients without locating saturation. Lab 08's one-CPU container results are a separate experiment. This guide is a presentation procedure, not a new recording or benchmark result.
