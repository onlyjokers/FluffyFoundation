<!--
Purpose: Handoff the accepted FF-03 completion and activate FF-04 for the next bounded Work session.
-->

# FF-03 To FF-04 Transition

FF-03 was accepted and committed as `b5fa051 Add runtime protocol validation`.

FF-04 is now the active next task: Manager/Auth/CORS Security Baseline.

The next Work boundary should stay inside manager/auth/CORS security baseline scope:

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

Target claim: deny manager role by default without secure config or explicit local insecure mode, make production CORS
fail closed, remove or isolate hardcoded frontend login secret to dev mode, and document/block production HTTP fallback
for manager control.
