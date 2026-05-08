<!--
Purpose: Record FF-22 performance budget, load, and show-mode resilience evidence.
-->

# FF-22 Evidence Summary

## Scope

Implemented an executable FF-22 runtime load/drill harness:

- Added `pnpm test:ff22` as the focused FF-22 command.
- Added `scripts/test-ff22-load-drill.mjs` as the phase assertion entry.
- Added `scripts/ff22/load-drill-runner.mjs` to start the real `@shugu/server` build output and connect Socket.IO
  manager, client, and display sockets over the runtime `msg` event.
- Recorded machine-readable budget and drill evidence under `.harness/evidence/FF-22/`.

No FF-23 security/release operations or FF-24 dogfood launch work was started.

## TDD Evidence

RED:

```text
node scripts/test-ff22-load-drill.mjs
FAIL Error [ERR_MODULE_NOT_FOUND]:
Cannot find module 'scripts/ff22/load-drill-runner.mjs'
```

GREEN:

```text
corepack pnpm@8.15.9 test:ff22
PASS
status=pass, 12 clients, 2 displays, 1 manager
```

Final validation:

```text
python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All full-verify stages before `harness:hotspots` passed, including dependency guards, lint, build, node-core tests,
FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, FF-08 boundary guard, and harness structure
validation.

## Runtime Proof

The FF-22 harness uses product runtime paths:

- Builds `@shugu/protocol` and `@shugu/server`.
- Starts `node apps/server/dist-out/main.js` with HTTPS local certificates and local insecure manager allowance.
- Connects one manager socket, twelve stage client sockets, and two display-group client sockets.
- Exercises existing Group ownership policy by sending `node-executor:reclaim` before manager control delivery.
- Measures runtime `screenColor` delivery over the server `msg` path.
- Drills network interruption, display refresh, client reconnect, and Root stop-all delivery.

Deterministic fixtures were not used as a substitute for runtime proof.

## Proof Matrix

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| server-startup | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 506ms <= 12000ms |
| connect-all | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 17ms <= 8000ms |
| client-list-propagation | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 0ms <= 2000ms |
| control-delivery | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 1ms <= 1500ms |
| network-recovery | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 2ms <= 4000ms |
| display-refresh-recovery | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 2ms <= 4000ms |
| client-reconnect-recovery | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 2ms <= 4000ms |
| root-stop-all-delivery | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 0ms <= 1500ms |
| harness-rss | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | 70.7MiB <= 512MiB |
| network-interruption | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | reconnect with stable identity |
| display-refresh | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | display group reconnect |
| client-reconnect | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | client group reconnect |
| root-stop-all | product-runtime | not-used-as-substitute | real Socket.IO server runtime | `.harness/evidence/FF-22/load-drill-report.json` | pass | none | Root shutdown delivered to clients |

Machine-readable artifacts:

- `.harness/evidence/FF-22/load-drill-report.json`
- `.harness/evidence/FF-22/test-ff22-load-drill-output.txt`

## Stop-Condition Review

No stop condition remains triggered:

- Load proof ran in the available environment.
- Thresholds were not weakened.
- Existing security, policy, audit, rollback, and hotspot boundaries were not weakened.
- FF-23 and FF-24 work was not started.
- No deferred proof or dated risk acceptance was used.

FF-23 may start after review. The only expected full-verify caveat remains the known out-of-scope hotspot baseline if it
appears during final validation.
