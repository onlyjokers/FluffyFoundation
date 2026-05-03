<!--
Purpose: Handoff the accepted FF-07 completion and activate FF-08 for the next bounded Work session.
-->

# FF-07 To FF-08 Transition

FF-07 was accepted and committed as `45ee4ea Add realtime delivery contract`.

FF-08 is now the active next task: Root/Manager Product Split.

The next Plan dispatch may start bounded FF-08 Work, but this status-transition boundary must not implement FF-08.

The next Work boundary should carry forward the FF-08 scope from `docs/harness/PLAN.md`:

- `/root` owns graph authoring, Group publishing, permissions, recovery, and global stop.
- `/manager` consumes published Groups and does not load heavy Rete/NodeCanvas bundles by default.
- Shared stores are split into connection, client registry view, display status, group controls, and root authoring
  domains.
- Bundle and import guards prevent Manager from reabsorbing Root code.

Verification target for FF-08:

- Build/bundle evidence shows Manager path excludes NodeCanvas/Rete.
- Manager can perform existing control paths through published Group controls.

Transition-only non-goals:

- Do not edit product code.
- Do not reopen FF-07.
- Do not start FF-08 Root/Manager product split implementation.
- Do not stage or commit this transition from Work.
