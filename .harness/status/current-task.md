<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-22 - Performance Budgets, Load, And Show Mode Resilience

## Previous Acceptance

FF-21 executable golden scenario work is complete with exact baseline validation fingerprint.

## Current Boundary

FF-22 scope from `docs/harness/PLAN.md` and `.harness/goals/FF-22-contract.md`.

Allowed lanes are defined by `.harness/goals/FF-22-contract.md`. Do not infer completion from this status file.

## Non-Goals

FF-22 non-goals from `.harness/goals/FF-22-contract.md`:

- Do not start FF-23.
- Do not claim show-mode resilience from small deterministic tests alone.
- Do not weaken thresholds to pass.

## FF-21 Final Report

- Added `pnpm test:golden` as the FF-21 phase command.
- Added an executable golden scenario suite that verifies all required scenario ids, rejects manual proof status, checks
  evidence paths, and requires both `slow` and `release` labels.
- Added a machine-readable proof matrix for Manager->Client, Root publish, Display fallback, asset preload,
  NodeExecutor deploy, ControlPlane transfer/reclaim, AI graph edit, rollback, and show stop.
- Recorded FF-21 evidence without starting FF-22 load, budget, or show-mode implementation.

Evidence:

- `.harness/evidence/FF-21/golden-suite.json`
- `.harness/evidence/FF-21/test-golden-output.txt`
- `.harness/evidence/FF-21/summary.md`
- `.harness/handoffs/2026-05-09-FF-21-golden-scenarios.md`

Focused validation:

- `corepack pnpm@8.15.9 test:golden`: PASS, 9 scenarios, status=complete
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; all prior guard/lint/build/test/e2e
  and harness structure steps pass.

FF-22 may start. FF-23 must not start.

## Verification Expectations

Run the FF-22 load/drill commands defined by the implementation plus:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails only at the known hotspot baseline
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`, record the exact fingerprint and do not
weaken hotspot ratchets.
