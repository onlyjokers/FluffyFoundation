<!--
Purpose: Track the active harness task for Looooper Plan/Work/Review sessions.
-->

# Current Task

FF-04 - Manager/Auth/CORS Security Baseline

## Current Boundary

Manager/auth/CORS security baseline scope:

- `apps/server/**` for auth/CORS/production boot checks
- `apps/manager/**` only where manager login/control configuration must be removed or isolated
- `packages/protocol/**` only if protocol-level auth/error types are strictly required
- related tests/fixtures for missing manager key and production-like insecure config denial
- `package.json` only for verification script wiring if required
- `docs/harness/**` only for FF-04 policy/evidence references
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-04/**`

## Next Expected Action

Implement only the FF-04 manager/auth/CORS security baseline boundary in the next bounded Work dispatch.
