<!--
Purpose: Handoff FF-22 load, budget, and show-mode resilience implementation status.
-->

# FF-22 Load Drill Handoff

## Status

FF-22 implementation is complete with focused runtime proof.

Implemented inside the active contract lanes:

- `scripts/test-ff22-load-drill.mjs`
- `scripts/ff22/load-drill-runner.mjs`
- `package.json`
- `.harness/evidence/FF-22/**`

## Verification

Focused check:

```text
corepack pnpm@8.15.9 test:ff22
PASS
```

Runtime shape:

- 1 manager socket
- 12 stage client sockets
- 2 display sockets
- real `@shugu/server` build output
- HTTPS localhost runtime with Socket.IO `msg` routing

Measured proof:

- server startup: 506ms <= 12000ms
- connect all: 17ms <= 8000ms
- client list propagation: 0ms <= 2000ms
- control delivery: 1ms <= 1500ms
- network recovery: 2ms <= 4000ms
- display refresh recovery: 2ms <= 4000ms
- client reconnect recovery: 2ms <= 4000ms
- root stop-all delivery: 0ms <= 1500ms
- harness RSS: 70.7MiB <= 512MiB

Evidence:

- `.harness/evidence/FF-22/load-drill-report.json`
- `.harness/evidence/FF-22/test-ff22-load-drill-output.txt`
- `.harness/evidence/FF-22/summary.md`

Final checks:

```text
python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All full-verify stages before `harness:hotspots` passed. Do not weaken the ratchet.

## Notes

- The harness uses the existing Group ownership policy by reclaiming the stage group through the runtime
  `node-executor:reclaim` command before measuring manager control delivery.
- Network interruption, display refresh, client reconnect, and Root stop-all are exercised through real Socket.IO
  connections, not deterministic fixtures.
- No FF-23 security/release or FF-24 dogfood launch work was started.
- FF-23 may start after final validation review.
