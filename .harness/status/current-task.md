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

## Transition Result

FF-07 was accepted and committed as `45ee4ea Add realtime delivery contract`.

FF-08 is now the active next task.

The next Plan dispatch may start bounded FF-08 Work, but this status-transition boundary must not implement FF-08.

## Next Expected Action

Review should verify this transition-only diff and then Plan may dispatch bounded FF-08 Work.
