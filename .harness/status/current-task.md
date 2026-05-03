<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-08 - Root/Manager Product Split

## Previous Acceptance

FF-07 was accepted and committed as `45ee4ea Add realtime delivery contract`.

## Current Boundary

Root/Manager product split scope from `docs/harness/PLAN.md`:

- `/root` owns graph authoring, Group publishing, permissions, recovery, and global stop.
- `/manager` consumes published Groups and does not load heavy Rete/NodeCanvas bundles by default.
- Shared stores are split into connection, client registry view, display status, group controls, and root authoring
  domains.
- Bundle and import guards prevent Manager from reabsorbing Root code.
- Verification target includes build/bundle evidence showing Manager path excludes NodeCanvas/Rete and Manager can
  perform existing control paths through published Group controls.

Allowed FF-08 implementation boundary for a future bounded Work dispatch:

- `/root` graph authoring, Group publishing, permissions, recovery, and global stop surfaces
- `/manager` consumption of published Groups without loading heavy Rete/NodeCanvas bundles by default
- split shared stores for connection, client registry view, display status, group controls, and root authoring domains
- bundle and import guards preventing Manager from reabsorbing Root code
- build/bundle evidence showing Manager path excludes NodeCanvas/Rete
- verification that Manager can perform existing control paths through published Group controls
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-08 policy/evidence/ADR references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-08/**`

## Work Result

FF-08 Work implementation is prepared for Review. The candidate separates `/manager` and `/manager/root`, adds
published Group controls, splits Manager store domains, and wires FF-08 tests and bundle/import guards into
`pnpm verify`.

## Next Expected Action

Review should verify the FF-08 implementation candidate and decide accept-and-commit or return a bounded revision.
