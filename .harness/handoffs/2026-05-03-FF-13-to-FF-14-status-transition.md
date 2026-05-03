<!--
Purpose: Record the harness-only status transition from FF-13 acceptance to FF-14 activation.
-->

# FF-13 to FF-14 Status Transition

## Transition

FF-13 was accepted and committed as `fe4c39a Add client control transfer lifecycle`.

The active harness phase/task is now:

`FF-14 - Distributed NodeExecutor V2 And Execution Partitions`

## FF-14 Boundary Preserved

FF-14 keeps the boundary from `docs/harness/PLAN.md`:

- Execution partitions define target platform: manager, client, display, server, worker, or local-only.
- Deploy, start, stop, remove, and redeploy are command-bus operations with validation, capability checks, revision
  binding, and status.
- Client and display partitions can control allowed targets only through ControlPlane.
- Watchdog, resource budgets, and failure reports are structured.
- Verification targets are bad capability rejection, stop/remove manager-side fallback recovery, and partition revision
  mismatch detection.

## Scope

This was harness-only status-transition work. It did not implement FF-14 behavior and did not change runtime, client,
manager, display, server, worker, Semantic Canvas, CLI, API, policy, audit, or AI visibility behavior.

`.looooper/workflow.yaml` was intentionally left untouched as residual local state outside this transition boundary.

## Proof Requested

- `git diff --check`
- `git status --short --branch`
- Focused readback of `.harness/status/current-phase.md`
- Focused readback of `.harness/status/current-task.md`
