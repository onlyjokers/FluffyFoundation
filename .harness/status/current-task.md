<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-11 - Graph Validation, Migrations, History, And Rollback

## Previous Acceptance

FF-10 was accepted and committed as `19f6b2b Add node registry v2 metadata`.

## Current Boundary

Graph Validation, Migrations, History, And Rollback scope from `docs/harness/PLAN.md`:

- Validator checks endpoint existence, port compatibility, param bounds, Group boundaries, execution platform,
  side effects, cycles, disabled nodes, and deployability.
- Versioned graph/project schema with migrations and fixtures.
- Semantic history captures meaningful changes but excludes layout-only noise.
- Rollback restores previous semantic revision and stops/redeploys partitions safely.
- Verification target includes old fixtures migrating to current, bad connections and param overflow failing with
  structured errors, and a rollback scenario restoring output behavior.

Allowed FF-11 implementation boundary for a future bounded Work dispatch:

- Graph validator checks for endpoint existence, port compatibility, param bounds, Group boundaries, execution platform,
  side effects, cycles, disabled nodes, and deployability
- Versioned graph/project schema, migrations, and migration fixtures
- Semantic history that captures meaningful graph changes and excludes layout-only noise
- Rollback that restores the previous semantic revision and safely stops/redeploys execution partitions
- Tests/fixtures proving old fixtures migrate, invalid connections and param overflow produce structured errors, and
  rollback restores output behavior
- `docs/harness/**` only for FF-11 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-11/**`

## Work Result

FF-10 has been accepted and committed. FF-11 is now active; this transition updates harness status only and does not
implement graph validation, migrations, semantic history, rollback, or runtime behavior.

## Next Expected Action

The next Plan dispatch may start bounded FF-11 Work using the boundary above.
