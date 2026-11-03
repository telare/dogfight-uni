# Lab 08 demonstration (five minutes)

Prepare `npm ci`, `npm run build`, and either `npm start` or the Docker image before presenting. The production procedure and external prerequisites are in [deployment.md](../deployment.md).

1. **0:00–1:00:** two pilots join the same sector and fly/fire. For the final showcase use a classmate and the public WSS URL; a local two-window match is the reproducible fallback, not remote-player evidence.
2. **1:00–2:00:** open `/health`, `/ready` and the staging `/dashboard.html`; explain SHA, 30 Hz tick budget, 60-tick p99 window and interval ELU. Point to saved container/staging JSON.
3. **2:00–3:00:** run `node scripts/container-smoke.js dogfight:lab08`. Show non-root UID, image size, shutdown message/1001, stalled-peer deadline, exit 0 and crash/restart recovery. Browser E2E separately proves the player returns to the lobby and reconnects.
4. **3:00–4:00:** inspect origin/IP verification and the fixed rejection counters. Show safe HTML-like pilot names/chat, and the three staging metric windows proving the healthy room stays connected during garbage rejection.
5. **4:00–5:00:** explain the workspace Docker stages, tested-image promotion by digest, rollback, PWA offline notice and one-process limitation. State outstanding launch evidence plainly.

Record a 3–5 minute video following this script after the public deployment and remote match exist. No video or phone-install evidence has been fabricated. Use the nine [reflection answers](../reflections/lab-08-answers.md) for questions.
