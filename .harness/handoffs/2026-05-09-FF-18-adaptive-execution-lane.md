<!--
Purpose: Record the FF-18 harness contract update that allows bounded adaptive /goal execution.
-->

# FF-18 Adaptive Execution Lane Handoff

Date: 2026-05-09

## Summary

The harness now allows a single FF-18 `/goal` run to combine blocker investigation, contract/evidence updates, TDD
implementation, runtime/browser proof, status/handoff updates, and commit when the work stays inside the active
contract.

This is not a relaxation of FF-18 completion proof. FF-18 remains incomplete until the proof matrix satisfies
`docs/harness/ACCEPTANCE.md` and `.harness/goals/FF-18-review-contract.md`.

## What changed

- Added an `Adaptive Goal Execution` section to `docs/harness/ACCEPTANCE.md`.
- Added an `Adaptive execution policy` machine field requirement to the acceptance validator.
- Updated `.harness/goals/FF-18-review-contract.md` with an approved adaptive client e2e/runtime proof lane.
- Added default disabled adaptive policies to FF-19 through FF-24 contracts.
- Updated `.harness/status/current-task.md` so the next FF-18 `/goal` can continue from the current GS-12 blocker.

## FF-18 adaptive lane

The FF-18 adaptive lane is limited to GS-12 flashlight/sensors proof and related runtime evidence. It may touch only
the listed contract paths, including the narrow client e2e/runtime proof files and their tests.

The lane may not:

- start FF-19;
- weaken production camera, flashlight, motion, microphone, permission, or capability gates;
- weaken security, policy, audit, rollback, redaction, dependency, or hotspot boundaries;
- treat deterministic fixtures as browser/runtime proof;
- mark FF-18 complete without live runtime/browser/product evidence.

## Next action

Run the next `/goal` against FF-18. It should continue with TDD inside the approved adaptive client proof lane, prove
the current GS-12 client NodeExecutor path through live Manager/Client/Server runtime, update evidence/status/handoff,
and commit code plus evidence together.
