<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-09 - Semantic Graph Object Model And Command Bus

## Previous Acceptance

FF-08 was accepted and committed as `4f12010 Split root and manager surfaces`.

## Current Boundary

Semantic graph object model and command bus scope from `docs/harness/PLAN.md`:

- `SemanticGraphSnapshot` excludes UI noise but includes nodes, definitions, ports, params, Group boundaries,
  connections, execution partitions, runtime status, device capabilities, errors, permissions, and current revision.
- Command bus supports add/remove/archive node, connect/disconnect, update params, create/update/archive Group,
  deploy/stop partition, and proposal workflow.
- Commands are transactional: dry-run validation, policy check, apply, audit, history, and rollback token.
- Canvas adapters translate UI gestures into commands instead of mutating graph internals directly.
- Verification target includes a CLI fixture performing the same semantic operation as Canvas and a UI-only semantic
  mutation guard that fails on direct graph mutation.

Allowed FF-09 implementation boundary for a future bounded Work dispatch:

- Semantic graph snapshot model for nodes, definitions, ports, params, Group boundaries, connections, execution
  partitions, runtime status, device capabilities, errors, permissions, and current revision
- Command bus operations for add/remove/archive node, connect/disconnect, update params, create/update/archive Group,
  deploy/stop partition, and proposal workflow
- Transactional command lifecycle with dry-run validation, policy check, apply, audit, history, and rollback token
- Canvas adapters that translate UI gestures into commands instead of mutating graph internals directly
- CLI fixture proving the same semantic operation as Canvas
- UI-only semantic mutation guard that fails on direct graph mutation
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-09 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-09/**`

## Work Result

FF-08 has been accepted and committed. FF-09 is now active; this transition updates harness status only and does not
implement the semantic graph object model or command bus.

## Next Expected Action

The next Plan dispatch may start bounded FF-09 Work using the boundary above.
