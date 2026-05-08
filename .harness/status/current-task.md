<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-24 - Dogfood, Documentation, And Production Launch Readiness

## Previous Acceptance

FF-23 security, supply-chain, release, and operations work is complete with focused release-operational proof.

## Current Boundary

FF-24 scope from `docs/harness/PLAN.md` and `.harness/goals/FF-24-contract.md`.

Allowed lanes are defined by `.harness/goals/FF-24-contract.md`. Do not infer completion from this status file.

## Non-Goals

FF-24 non-goals from `.harness/goals/FF-24-contract.md`:

- Do not implement missing FF-18 through FF-23 product work.
- Do not mark production ready with release-blocking risks open.
- Do not treat synthetic or deterministic-only evidence as dogfood proof.

## FF-23 Final Report

- Added `pnpm test:ff23` as the FF-23 phase command.
- Added a release/security gate that checks dependency review, secret scanning, CodeQL-equivalent static gates,
  provenance notes, production config validation, backup/restore, release checklist, and rollback/incident procedure.
- Added CI security job coverage for the FF-23 dependency/audit gate, secret scan, and static policy gates.
- Added release operations docs and accepted-risk data.
- Added explicit root `@eslint/js` dependency for repeatable clean-install lint/build verification.

Evidence:

- `.harness/evidence/FF-23/release-security-report.json`
- `.harness/evidence/FF-23/test-ff23-release-security-output.txt`
- `.harness/evidence/FF-23/pnpm-audit-output.json`
- `.harness/evidence/FF-23/summary.md`
- `.harness/handoffs/2026-05-09-FF-23-release-security.md`

Focused validation:

- `corepack pnpm@8.15.9 test:ff23`: PASS, status=pass
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS
- `git diff --check`: PASS
- `corepack pnpm@10.20.0 audit --audit-level high --registry=https://registry.npmjs.org --json`: raw exit=1,
  `low=4`, `moderate=10`, `high=0`, `critical=0`; all low/moderate advisories are dated accepted risks.
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot ratchet
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; preceding guard/lint/build/test/e2e
  gates pass.

FF-24 may start after final validation review.

## Verification Expectations

Run the FF-24 dogfood/launch-readiness commands defined by the implementation plus:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails only at the known hotspot baseline
`apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`, record the exact fingerprint and do not
weaken hotspot ratchets.
