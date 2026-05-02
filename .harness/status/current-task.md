<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-06 - Server State Strategy And Multi-Instance Contract

## Current Boundary

Server state strategy and multi-instance contract scope from `docs/harness/PLAN.md`:

- ADR chooses either explicit single-server production mode or shared state for registry, selection, ownership, and
  control-plane snapshot.
- If single-server: boot/runtime checks make it visible and reject unsupported clustered configs.
- If shared-state: registry/control-plane updates publish/subscribe and converge across instances.
- Status UI and logs show the active state strategy.
- Verification target: single-server guard or two-instance convergence test, and ownership snapshot cannot diverge
  silently.

Allowed FF-06 implementation boundary for a future bounded Work dispatch:

- server state strategy/boot/runtime checks and related logs/status surfaces
- shared-state or single-server ADR/evidence required by the chosen strategy
- related tests/fixtures proving the selected single-server guard or two-instance convergence behavior
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-06 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-06/**`

## Next Expected Action

The next Plan dispatch may start bounded FF-06 Work. This FF-05-to-FF-06 status-transition boundary must not implement
FF-06 server state strategy behavior.
