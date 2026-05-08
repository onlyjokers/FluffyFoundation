<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-23 - Security, Supply Chain, Release, And Operations

## Previous Acceptance

FF-22 load, budget, and show-mode resilience work is complete with focused runtime proof.

## Current Boundary

FF-23 scope from `docs/harness/PLAN.md` and `.harness/goals/FF-23-contract.md`.

Allowed lanes are defined by `.harness/goals/FF-23-contract.md`. Do not infer completion from this status file.

## Non-Goals

FF-23 non-goals from `.harness/goals/FF-23-contract.md`:

- Do not start FF-24.
- Do not treat checklist prose as passing security proof.
- Do not weaken security, audit, rollback, or release gates to pass.

## FF-22 Final Report

- Added `pnpm test:ff22` as the FF-22 phase command.
- Added a runtime load/drill harness that starts the real `@shugu/server` build output and connects one manager,
  twelve stage clients, and two display clients over Socket.IO.
- Exercised existing Group ownership policy by reclaiming the stage group before measuring manager control delivery.
- Recorded budget and drill proof for network interruption, display refresh, client reconnect, and Root stop-all.

Evidence:

- `.harness/evidence/FF-22/load-drill-report.json`
- `.harness/evidence/FF-22/test-ff22-load-drill-output.txt`
- `.harness/evidence/FF-22/summary.md`
- `.harness/handoffs/2026-05-09-FF-22-load-drill.md`

Focused validation:

- `corepack pnpm@8.15.9 test:ff22`: PASS, status=pass
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot baseline
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; all prior guard/lint/build/test/e2e
  and harness structure steps pass.

FF-23 may start after final validation review. FF-24 must not start.

## Verification Expectations

Run the FF-23 security/release commands defined by the implementation plus:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails only at the known hotspot baseline
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`, record the exact fingerprint and do not
weaken hotspot ratchets.
