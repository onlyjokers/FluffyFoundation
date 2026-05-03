<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-07 - Realtime Delivery Contract, Backpressure, And Final-Value Semantics

## Previous Acceptance

FF-06 was accepted and committed as `74aa818 Add single-server state strategy guard`.

## Current Boundary

Realtime delivery contract, backpressure, and final-value semantics scope from `docs/harness/PLAN.md`:

- Explicit classes for volatile telemetry, latest-state controls, reliable commands, and scheduled commands.
- SDK/server throttling share one delivery contract.
- Latest-state keys are replayed or removed with no dead pending map.
- Metrics track dropped, coalesced, delivered, late, and rejected messages.
- Verification target includes deterministic tests for coalescing and last-value delivery plus load test records for
  latency/drop budgets.

Allowed FF-07 implementation boundary for a future bounded Work dispatch:

- realtime delivery class definitions and shared SDK/server delivery contract
- throttling/backpressure behavior for volatile telemetry, latest-state controls, reliable commands, and scheduled
  commands
- latest-state replay/removal behavior that avoids dead pending maps
- dropped, coalesced, delivered, late, and rejected message metrics
- deterministic tests for coalescing and last-value delivery
- load test records for latency/drop budgets
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-07 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-07/**`

## Work Result

FF-07 Work is ready for Review.

Implemented:

- shared delivery contract for volatile telemetry, latest-state controls, reliable commands, and scheduled commands
- SDK/server throttling through the shared contract
- latest-state replay/removal with no dead pending map after drain
- dropped, coalesced, delivered, late, and rejected metrics
- deterministic tests for coalescing and last-value delivery
- bounded local load fixture and evidence records under `.harness/evidence/FF-07/`

## Next Expected Action

Review should verify the FF-07 diff, final checks, and handoff evidence before accepting or requesting fixes.
