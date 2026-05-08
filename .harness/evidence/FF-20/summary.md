<!--
Purpose: Record FF-20 evidence for observability, reporting, and operator-console work.
-->

# FF-20 Evidence Summary

## Scope

Implemented the Manager operator-console proof surface for FF-20:

- Structured observability events for validation errors, permission denials, transport failures, node executor status,
  display status, asset readiness, AI proposals, and rollback.
- Metrics snapshot fields for latency, traffic, errors, saturation, drops, FPS, audio readiness, device capability, and
  command outcomes.
- Manager dashboard Operator Console showing health, active partitions, connected devices, failed commands, pending
  transfers, kill-switch state, and failed-display diagnosis.
- Runtime/browser evidence from a live Manager connected to the existing HTTPS server plus a real Socket.IO display
  client emitting structured display readiness and node-executor rejection reports.

No FF-21 golden scenario command, FF-22 load/show-mode budgets, FF-23 security/release work, or FF-24 dogfood launch
work was started.

## TDD Evidence

RED:

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/domain/operator-console.spec.ts
FAIL
SyntaxError: The requested module './operator-console' does not provide an export named
'buildOperatorConsoleSnapshotInput'
```

GREEN:

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/domain/operator-console.spec.ts
PASS
4 tests, 0 failures
```

Focused validation:

```text
corepack pnpm@8.15.9 --filter @shugu/manager run lint
PASS

corepack pnpm@8.15.9 --filter @shugu/manager run build
PASS

python3 .harness/scripts/check_hotspots.py
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

`corepack pnpm@8.15.9 --filter @shugu/manager run check` was also sampled and still fails on broad pre-existing
manager type debt outside FF-20; FF-20-introduced type errors were fixed before final validation.

## Runtime/Browser Proof

Browser/runtime proof used Playwright MCP after browser-use MCP could navigate but failed state/html reads with CDP
initialization errors. The proof path was:

1. Open `https://localhost:5176/manager` in a real browser.
2. Handle Chrome localhost certificate warning by clicking Advanced and continuing to localhost.
3. Log in as `Eureka` using the dev password already authorized by the user.
4. Connect Manager to `https://localhost:3001` after trusting the server certificate via `/health`.
5. Start a real Socket.IO client with `role=client`, `group=display`, and client id `ff20-display-proof`.
6. Emit structured `display ready` and `node-executor rejected` custom sensor reports through the live server.
7. Verify the Operator Console text changes to degraded, shows `permission-denial`, and reports `diagnosed` with
   `target group must match scopeGroupId`.

Evidence artifacts:

- `.harness/evidence/FF-20/operator-console-runtime-proof.json`
- `.harness/evidence/FF-20/operator-console-runtime-text.txt`
- `.harness/evidence/FF-20/operator-console-runtime-snapshot.md`

## Proof Matrix

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Structured reports cover required FF-20 categories | deterministic | `operator-console.spec.ts` verifies category normalization and metric classes | N/A for category table | `.harness/evidence/FF-20/summary.md` | proven | N/A | Includes validation-error, permission-denial, transport-failure, node-executor-status, display-status, asset-readiness, ai-proposal, rollback. |
| Metrics expose required latency, traffic, error, saturation, drop, FPS, readiness, capability, and command fields | deterministic | `operator-console.spec.ts` verifies metric snapshot fields and command outcomes | N/A for metric field shape | `.harness/evidence/FF-20/summary.md` | proven | N/A | Runtime console renders the command outcome and connected-device subset. |
| Operator console surfaces health, partitions, devices, failed commands, pending transfers, and kill-switch state | deterministic + runtime-browser | `operator-console.spec.ts`; `OperatorConsole.svelte`; `operator-console-store.ts` | Browser snapshot and runtime proof JSON show live console on Manager dashboard | `.harness/evidence/FF-20/operator-console-runtime-proof.json` | proven | N/A | Pending transfers and active partitions are visible as empty states when none are live. |
| Failed display update can be diagnosed from structured reports | deterministic + product-runtime | `diagnoseFailedDisplayUpdate` test derives diagnosis from structured events | Live Socket.IO display client emits `node-executor rejected`; console shows `diagnosed` | `.harness/evidence/FF-20/operator-console-runtime-proof.json` | proven | N/A | Proof is not a fixture substitution; report traverses server -> Manager SDK -> `sensorData` -> console. |
| Runtime/browser proof is not substituted with deterministic fixtures | runtime-browser | Deterministic tests are separate | Real browser and live HTTPS server proof recorded | `.harness/evidence/FF-20/operator-console-runtime-snapshot.md` | proven | N/A | Browser-use MCP was attempted; Playwright MCP handled the browser after browser-use state/html failed. |

## Stop-Condition Review

No stop condition remains triggered:

- Runtime/browser diagnosis proof exists and is recorded.
- FF-21, FF-22, FF-23, and FF-24 work was not started.
- Structured failures are visible as reports and are not hidden behind UI-only state.
- Security, policy, audit, rollback, dependency, and hotspot boundaries were not weakened.
- No deferred proof or dated risk acceptance was used.

FF-21 may start. The only remaining full-verify failure is the exact known out-of-scope hotspot baseline recorded before
FF-20 work.
