<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-14 - Distributed NodeExecutor V2 And Execution Partitions

## Previous Acceptance

FF-13 was accepted and committed as `fe4c39a Add client control transfer lifecycle`.

## Current Boundary

Distributed NodeExecutor V2 And Execution Partitions scope from `docs/harness/PLAN.md`:

- Execution partitions define target platform: manager, client, display, server, worker, or local-only.
- Deploy, start, stop, remove, and redeploy are command-bus operations with validation, capability checks, revision
  binding, and status.
- Client and display partitions can control allowed targets only through ControlPlane.
- Watchdog, resource budgets, and failure reports are structured.
- Verification target includes bad capability rejection, stop/remove manager-side fallback recovery, and partition
  revision mismatch detection.

Allowed FF-14 implementation boundary for a future bounded Work dispatch:

- Execution partition target platforms: manager, client, display, server, worker, and local-only
- Command-bus deploy/start/stop/remove/redeploy operations with validation, capability checks, revision binding, and
  status
- ControlPlane-only control path for client/display partitions over allowed targets
- Structured watchdog, resource-budget, and failure-report handling
- Tests proving bad capability rejection, stop/remove manager-side fallback recovery, and partition revision mismatch
  detection
- `docs/harness/**` only for FF-14 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-14/**`

## Work Result

FF-13 has been accepted and committed. FF-14 is now active; this transition updates harness status only and does not
implement distributed NodeExecutor behavior, execution partitions, command-bus lifecycle operations, ControlPlane
partition control, watchdogs, resource budgets, or runtime failure reporting.

## Next Expected Action

The next Plan dispatch may start bounded FF-14 Work using the boundary above.
