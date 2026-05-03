<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-10 - Node Registry V2 And Agent-Readable Node Definitions

## Previous Acceptance

FF-09 was accepted and committed as `38410b8 Add semantic command bus`.

## Current Boundary

Node Registry V2 and agent-readable node definition scope from `docs/harness/PLAN.md`:

- `NodeDefinition` includes version, category, platform targets, side-effect class, permission needs, port schemas,
  param schemas, units, ranges, defaults, compatibility rules, examples, risk notes, and AI-readable description.
- JSON specs and `@shugu/node-core` definitions converge behind one registry loader.
- New node fixture proves registration requires no global switch edit.
- Registry emits compact agent summaries for AI context.
- Verification target includes `pnpm validate:node-specs`, a no-global-switch registry test, and an AI context snapshot
  that includes a newly added fixture node automatically.

Allowed FF-10 implementation boundary for a future bounded Work dispatch:

- NodeDefinition metadata for version, category, platform targets, side-effect class, permission needs, port schemas,
  param schemas, units, ranges, defaults, compatibility rules, examples, risk notes, and AI-readable description
- Registry loader convergence for JSON specs and `@shugu/node-core` definitions
- No-global-switch registration fixture
- Compact agent summaries for AI context
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-10 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-10/**`

## Work Result

FF-09 has been accepted and committed. FF-10 is now active; this transition updates harness status only and does not
implement Node Registry V2 or agent-readable node definitions.

## Next Expected Action

The next Plan dispatch may start bounded FF-10 Work using the boundary above.
