<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-21 - Executable Golden Scenarios

## Previous Acceptance

FF-20 observability, reporting, and operator-console work is complete with exact baseline validation fingerprint.

## Current Boundary

FF-21 scope from `docs/harness/PLAN.md` and `.harness/goals/FF-21-contract.md`.

Allowed lanes are defined by `.harness/goals/FF-21-contract.md`. Do not infer completion from this status file.

## Non-Goals

FF-21 non-goals from `.harness/goals/FF-21-contract.md`:

- Do not start FF-22.
- Do not mark manual-only scenarios as executable.
- Do not substitute deterministic fixtures for required browser/runtime proof.
- Do not change CI or package scripts unless the approved FF-21 implementation scope explicitly requires it.

## FF-20 Final Report

- Added a Manager Operator Console that displays health, active partitions, connected devices, failed commands,
  pending transfers, kill-switch state, and failed-display diagnosis.
- Added structured observability event and metrics aggregation for validation errors, permission denials, transport
  failures, node executor status, display status, asset readiness, AI proposals, rollback, latency, traffic, errors,
  saturation, drops, FPS, audio readiness, device capability, and command outcomes.
- Added deterministic tests for event categories, metrics, snapshot aggregation, and structured failed-display
  diagnosis.
- Recorded runtime/browser proof from a live Manager connected to the HTTPS server plus a real Socket.IO display client
  emitting structured readiness and node-executor rejection reports.

Evidence:

- `.harness/evidence/FF-20/summary.md`
- `.harness/evidence/FF-20/operator-console-runtime-proof.json`
- `.harness/evidence/FF-20/operator-console-runtime-text.txt`
- `.harness/evidence/FF-20/operator-console-runtime-snapshot.md`
- `.harness/handoffs/2026-05-09-FF-20-operator-console.md`

Focused validation:

- `corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/domain/operator-console.spec.ts`: PASS, 4 tests, 0 failures
- `corepack pnpm@8.15.9 --filter @shugu/manager run lint`: PASS
- `corepack pnpm@8.15.9 --filter @shugu/manager run build`: PASS
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; all prior guard/lint/build/test/e2e
  and harness structure steps pass.

FF-21 may start. FF-22 must not start.

## Verification Expectations

Run the FF-21 golden scenario command defined by the implementation plus:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails only at the known hotspot baseline
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`, record the exact fingerprint and do not
weaken hotspot ratchets.
