<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-03 - Runtime Protocol Schema And Compatibility

## Current Boundary

Runtime protocol schema and compatibility scope:

- `packages/protocol/**`
- `apps/server/**` only where message validation/logging integration is required
- related tests/fixtures for protocol and server rejection paths
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-03 policy/evidence references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-03/**`

## Next Expected Action

Implement only the FF-03 runtime protocol schema validation and compatibility fixture boundary in the next bounded Work
dispatch.
