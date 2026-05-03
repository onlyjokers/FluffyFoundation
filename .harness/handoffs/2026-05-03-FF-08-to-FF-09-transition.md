<!--
Purpose: Handoff the accepted FF-08 completion and activate FF-09 for the next bounded Work session.
-->

# FF-08 To FF-09 Transition

FF-08 was accepted and committed as `4f12010 Split root and manager surfaces`.

FF-09 is now the active next task: Semantic Graph Object Model And Command Bus.

The next Plan dispatch may start bounded FF-09 Work, but this status-transition boundary must not implement FF-09.

The next Work boundary should carry forward the FF-09 scope from `docs/harness/PLAN.md`:

- `SemanticGraphSnapshot` excludes UI noise but includes nodes, definitions, ports, params, Group boundaries,
  connections, execution partitions, runtime status, device capabilities, errors, permissions, and current revision.
- Command bus supports add/remove/archive node, connect/disconnect, update params, create/update/archive Group,
  deploy/stop partition, and proposal workflow.
- Commands are transactional: dry-run validation, policy check, apply, audit, history, and rollback token.
- Canvas adapters translate UI gestures into commands instead of mutating graph internals directly.

Verification target for FF-09:

- CLI fixture performs the same semantic operation as Canvas.
- UI-only semantic mutation guard fails on direct graph mutation.

Transition-only non-goals:

- Do not edit product code.
- Do not reopen FF-08.
- Do not start FF-09 Semantic Graph Object Model And Command Bus implementation.
- Do not stage or commit this transition from Work.
