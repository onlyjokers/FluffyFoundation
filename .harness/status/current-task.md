<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-17 - Plugin Host And Capability Lifecycle

## Previous Acceptance

FF-16 was accepted and committed as `59661aa`.

## Current Boundary

Plugin Host And Capability Lifecycle scope from `docs/harness/PLAN.md`:

- Plugin contract for load, init, start, stop, configure, dispose, status, capabilities, errors, resource budgets, and
  side effects.
- Registry-driven plugin discovery and version compatibility.
- No plugin may mutate core state outside commands/events.
- Plugin failure isolation prevents one plugin from breaking the show loop.
- Verification targets are plugin lifecycle tests and a failure fixture proving dispose/rollback.

Allowed FF-17 implementation boundary for a future bounded Work dispatch:

- Plugin contract covering load, init, start, stop, configure, dispose, status, capabilities, errors, resource budgets,
  and side effects
- Registry-driven plugin discovery and version compatibility
- Core-state mutation only through commands/events
- Plugin failure isolation so one plugin cannot break the show loop
- Tests proving plugin lifecycle behavior
- Failure fixture proving dispose/rollback
- `docs/harness/**` only for FF-17 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-17/**`

## Work Result

FF-16 has been accepted and committed as `59661aa`. FF-17 is now active; this transition updates harness status only
and does not implement plugin host behavior, plugin lifecycle behavior, plugin discovery, version compatibility,
core-state mutation controls, plugin failure isolation, lifecycle tests, or dispose/rollback fixtures.

## Next Expected Action

The next Plan dispatch may start bounded FF-17 Work from `docs/harness/PLAN.md` using the boundary above.
