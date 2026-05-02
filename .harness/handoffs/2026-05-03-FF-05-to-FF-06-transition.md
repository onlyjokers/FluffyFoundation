<!--
Purpose: Handoff the accepted FF-05 completion and activate FF-06 for the next bounded Work session.
-->

# FF-05 To FF-06 Transition

FF-05 was accepted and committed as `30c43ac Add scoped command envelope enforcement`.

FF-06 is now the active next task: Server State Strategy And Multi-Instance Contract.

The next Plan dispatch may start bounded FF-06 Work, but this status-transition boundary must not implement FF-06.

The next Work boundary should carry forward the FF-06 scope from `docs/harness/PLAN.md`:

- ADR chooses either explicit single-server production mode or shared state for registry, selection, ownership, and
  control-plane snapshot.
- If single-server: boot/runtime checks make it visible and reject unsupported clustered configs.
- If shared-state: registry/control-plane updates publish/subscribe and converge across instances.
- Status UI and logs show the active state strategy.

Verification target for FF-06:

- Single-server guard or two-instance convergence test.
- Ownership snapshot cannot diverge silently.

Transition-only non-goals:

- Do not edit product code.
- Do not modify FF-05 implementation.
- Do not start FF-06 server state strategy implementation.
- Do not stage or commit this transition.
