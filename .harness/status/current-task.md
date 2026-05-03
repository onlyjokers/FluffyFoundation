<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-15 - Display Transport Unification And Multi-Display Routing

## Previous Acceptance

FF-14 was accepted and committed as `cbe7528 Add execution partition lifecycle`.

## Current Boundary

Display Transport Unification And Multi-Display Routing scope from `docs/harness/PLAN.md`:

- Local MessagePort and server fallback implement the same transport interface.
- Display status distinguishes discovered, paired, reachable, degraded, fallback, and failed.
- Multi-display routing supports groups, named displays, capabilities, local media limits, and server-deliverable assets.
- Display operations report ack/nack with reason.
- Verification targets are local bridge success, forced local bridge failure fallback through server with visible output
  update, and a multi-display routing fixture sending different outputs to two displays.

Allowed FF-15 implementation boundary for a future bounded Work dispatch:

- Local MessagePort and server fallback transport unification behind one transport interface
- Display status states for discovered, paired, reachable, degraded, fallback, and failed
- Multi-display routing for groups, named displays, capabilities, local media limits, and server-deliverable assets
- Structured ack/nack with reason for Display operations
- Tests proving local bridge success, forced local bridge failure fallback through server with visible output update, and
  different outputs routed to two displays
- `docs/harness/**` only for FF-15 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-15/**`

## Work Result

FF-14 has been accepted and committed. FF-15 is now active; this transition updates harness status only and does not
implement Display transport unification, local MessagePort behavior, server fallback behavior, Display status states,
multi-display routing, media routing limits, server-deliverable asset handling, or Display operation ack/nack behavior.

## Next Expected Action

The next Plan dispatch may start bounded FF-15 Work using the boundary above.
