<!--
Purpose: Record FF-09 semantic graph command-bus evidence for Review.
-->

# FF-09 Evidence Summary

## Scope

- Added `SemanticGraphSnapshot` and transactional semantic command bus in `@shugu/node-core`.
- Routed the touched Canvas add/connect gesture paths through a command adapter before applying to `NodeEngine`.
- Added CLI parity and UI-only mutation guard fixtures under `.harness/evidence/FF-09/`.

## Semantic Snapshot Coverage

`SemanticGraphSnapshot` includes semantic nodes, definitions, ports, params, Group boundaries, connections,
execution partitions, runtime status, device capabilities, errors, permissions, proposals, and current revision.
It intentionally strips Canvas/UI-only fields such as position, selected, collapsed, hidden, and minimized.

## Command Lifecycle Coverage

The command bus supports:

- Node add/remove/archive, connect/disconnect, and params update.
- Group create/update/archive.
- Partition deploy/stop.
- Proposal create.
- Dry-run validation, policy check, apply, audit, history, and rollback token.

## Canvas/CLI/API Parity

`.harness/evidence/FF-09/semantic-cli-fixture.mjs` executes the same semantic operation through a Canvas actor and
a CLI actor: add a `math` node and connect `number.out` to `math.a`.

Result: `.harness/evidence/FF-09/semantic-cli-result.json`.

## UI Mutation Guard

`.harness/evidence/FF-09/ui-semantic-mutation-guard.mjs` fails if the touched Canvas add/connect gesture boundary
calls `nodeEngine.addNode(` or `nodeEngine.addConnection(` directly outside the explicit command-application bridge.

Result: `.harness/evidence/FF-09/ui-semantic-mutation-guard-result.json`.

## Browser/Runtime Proof

No browser proof was run for this first model/command-bus slice. Canvas UI gesture behavior was not visually changed;
the touched add/connect paths are covered by the contract test, CLI parity fixture, manager production build, and
mutation guard.
