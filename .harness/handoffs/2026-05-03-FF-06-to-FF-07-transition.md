<!--
Purpose: Handoff the accepted FF-06 completion and activate FF-07 for the next bounded Work session.
-->

# FF-06 To FF-07 Transition

FF-06 was accepted and committed as `74aa818 Add single-server state strategy guard`.

FF-07 is now the active next task: Realtime Delivery Contract, Backpressure, And Final-Value Semantics.

The next Plan dispatch may start bounded FF-07 Work, but this status-transition boundary must not implement FF-07.

The next Work boundary should carry forward the FF-07 scope from `docs/harness/PLAN.md`:

- Explicit classes for volatile telemetry, latest-state controls, reliable commands, and scheduled commands.
- SDK/server throttling share one delivery contract.
- Latest-state keys are replayed or removed with no dead pending map.
- Metrics track dropped, coalesced, delivered, late, and rejected messages.

Verification target for FF-07:

- Deterministic tests for coalescing and last-value delivery.
- Load test records for latency/drop budgets.

Transition-only non-goals:

- Do not edit product code.
- Do not modify FF-06 implementation.
- Do not start FF-07 realtime delivery, backpressure, or final-value implementation.
- Do not stage or commit this transition from Work.
