<!--
Purpose: Record the FF-18 GS-13 Display modulation stop condition for the next Plan/Work/Review handoff.
-->

# FF-18 GS-13 Display Modulate Stop

Date: 2026-05-09

## Result

FF-18 is still incomplete. Do not start FF-19.

The remaining blocker is full GS-13 product proof: the Display visual must become breathing-like and the AI observation
loop must observe the output change. Current proof is still only partial because the bounded Manager Published Display
solid `screenColor` chain is proven, but Display runtime modulation is not implemented.

## Evidence

- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/status/current-task.md`

## Root Cause

- `packages/node-core/src/definitions/nodes/processors.ts` emits a `screenColor` command with `mode="modulate"`,
  `secondaryColor`, `minOpacity`, `maxOpacity`, `frequencyHz`, and `waveform`.
- `packages/sdk-client/src/action-executors.ts` has a Client `ScreenController` that supports animated screen color
  modulation.
- `apps/display/src/lib/stores/display.ts` ignores the modulation fields and writes only static `color + opacity` to
  `screenOverlay`.
- `apps/display/src/routes/+page.svelte` renders the overlay as one fixed div with static background/opacity style.

## Stop Condition

The active contract forbids `apps/display/**`:

- `.harness/goals/FF-18-review-contract.md`

Codex must stop instead of implementing Display-side modulation under the current contract. Fixing this safely requires
an approved bounded GS-13 Display runtime proof lane or a dated risk acceptance that explicitly leaves full Display
breathing-like product proof incomplete.

## Next Allowed Action

Review should choose one path:

- Revise the FF-18 contract to allow a narrow `apps/display/**` GS-13 modulation lane with TDD, browser/runtime proof,
  and no security/policy/audit/rollback weakening.
- Or approve a dated risk acceptance that keeps FF-18 incomplete or complete-with-risk under the rules in
  `docs/harness/ACCEPTANCE.md`.

Do not use deterministic fixtures or the existing solid-color Display proof as a substitute for full GS-13
breathing-like runtime proof.
