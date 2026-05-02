<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-01 - Unified Verify, CI, And Evidence Artifacts

## Current Boundary

Verification wiring and evidence only:

- `package.json`
- `pnpm-lock.yaml` if package script or dependency changes require it
- `.github/workflows/**`
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-01/**`
- `.harness/scripts/**` only for FF-01 verification/evidence-gate support
- `scripts/**` only for root `pnpm verify` guard or validation commands

## Next Expected Action

Run `pnpm verify` and requested subchecks, capture executable negative proofs for boundary imports and node specs,
then write the FF-01 evidence/handoff before moving to the next FF task.
