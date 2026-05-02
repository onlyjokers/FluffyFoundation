<!--
Purpose: Handoff FF-04 manager/auth/CORS security baseline implementation to Review.
-->

# FF-04 Work Handoff

## Summary

Implemented the FF-04 security baseline inside the approved manager/auth/CORS boundary.

## Changed Areas

- `apps/server/src/bootstrap/security-policy.ts`: central security policy for production boot, CORS, manager role grant, and local insecure mode.
- `apps/server/src/main.ts`: validates production security config before importing the app module and blocks production HTTP fallback.
- `apps/server/src/events/events.gateway.ts`: uses fail-closed Socket.IO CORS options and denies requested manager role unless the manager key is valid or explicit local insecure mode applies.
- `apps/server/src/events/events.gateway.spec.ts` and `apps/server/src/bootstrap/security-policy.spec.ts`: denial and production boot/CORS tests.
- `apps/manager/src/lib/stores/auth.ts`: removes legacy hardcoded password and gates password login to explicit Vite dev config.
- `apps/manager/src/lib/components/ManagerLoginPanel.svelte` and `apps/manager/src/routes/+page.svelte`: isolate login UI and block production `http:` manager control connections.
- `apps/manager/src/lib/stores/auth.spec.ts`: frontend auth source proof.
- `.harness/evidence/FF-04/summary.md`: evidence and residual risks.

## Proof

- `TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm tsx --test "apps/server/src/**/*.spec.ts"`: PASS.
- `pnpm tsx --test apps/manager/src/lib/stores/auth.spec.ts`: PASS.
- `pnpm build:all`: PASS.
- `pnpm verify`: PASS.

## Notes For Review

- No new dependency or lockfile change was introduced.
- Browser/runtime proof was not required by Runtime Input; CLI/test proof covers the FF-04 policy boundary.
- Existing warnings are documented in `.harness/evidence/FF-04/summary.md`.

## FF-04 To FF-05 Transition

FF-04 - Manager/Auth/CORS Security Baseline was accepted and committed as
`5617f78 Add manager auth security baseline`.

FF-05 - Scope, Audit, And Command Envelope Repair is now the active next phase.

The next Work dispatch should stay inside the FF-05 scope/audit/command-envelope boundary: SDK manager caller scope
preservation and batching/flush behavior, protocol command envelope/audit contracts if required, server
normalization/authorization/rejection/audit integration, and related scope preservation or denial tests.
