<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-05 - Scope, Audit, And Command Envelope Repair

## Current Boundary

Scope/audit/command-envelope repair scope:

- `packages/sdk-manager/**` for caller scope preservation and batching/flush behavior
- `packages/protocol/**` for command envelope/audit contracts if required
- `apps/server/**` for normalization/authorization/rejection/audit integration
- related tests/fixtures for scope preservation and missing/wrong scope denial
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-05 policy/evidence references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-05/**`

## Next Expected Action

Implement only the FF-05 scope/audit/command-envelope repair boundary in the next bounded Work dispatch.
