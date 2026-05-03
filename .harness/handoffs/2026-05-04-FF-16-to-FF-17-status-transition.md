<!--
Purpose: Record the harness-only status transition from FF-16 acceptance to FF-17 activation.
-->

# FF-16 to FF-17 Status Transition

## Transition

FF-16 was accepted and committed as `59661aa`.

The active harness phase/task is now:

`FF-17 - Plugin Host And Capability Lifecycle`

## FF-17 Boundary Preserved

FF-17 keeps the boundary from `docs/harness/PLAN.md`:

- Plugin contract for load, init, start, stop, configure, dispose, status, capabilities, errors, resource budgets, and
  side effects.
- Registry-driven plugin discovery and version compatibility.
- No plugin may mutate core state outside commands/events.
- Plugin failure isolation prevents one plugin from breaking the show loop.
- Verification targets are plugin lifecycle tests and a failure fixture proving dispose/rollback.

## Scope

This was harness-only status-transition work. It did not implement FF-17 plugin host behavior and did not change
runtime, protocol, registry, AI, semantic graph, command bus, plugin packages, app code, server code, tests, package
manifests, lockfiles, CI, or `.harness/evidence/**`.

The approved git-status exception remains unrelated and non-blocking: `.looooper/workflow.yaml`, `.claude/`,
`.gitnexus/`, and `CLAUDE.md` may appear in `git status --short --branch` and were intentionally left untouched.

## Approved Process Override

For this harness-only dispatch, the Plan/Work/Review harness runtime contract controls the session. Work did not run
superpowers batch feedback waits or `superpowers:finishing-a-development-branch`; Review owns final accept-and-commit.

## Rollback

If Review rejects this transition, revert only this handoff and the two status files. Do not touch commit `59661aa` or
unrelated local state.

## Proof Requested

- `git diff --check`
- `git status --short --branch`
- Focused readback of `.harness/status/current-phase.md`
- Focused readback of `.harness/status/current-task.md`
- Readback of this handoff
