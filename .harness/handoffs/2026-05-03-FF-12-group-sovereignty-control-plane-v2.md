<!--
Purpose: Handoff FF-12 Group sovereignty and ControlPlane V2 implementation to Review.
-->

# FF-12 Group Sovereignty And ControlPlane V2 Handoff

## Result

PASS candidate for Review.

Implemented Group sovereignty and ControlPlane V2 across shared protocol contracts, node-core semantic command policy,
server ingress enforcement, server control-plane snapshots, and Manager SDK command-envelope proof.

## Key Files

- `packages/protocol/src/control-plane.ts`
- `packages/protocol/src/control-plane.spec.ts`
- `packages/node-core/src/semantic-command-bus.ts`
- `packages/node-core/src/semantic-command-apply.ts`
- `packages/node-core/test/group-ownership-policy.test.mjs`
- `apps/server/src/client-registry/group-ownership-registry.ts`
- `apps/server/src/events/group-ownership-policy.ts`
- `apps/server/src/events/events.gateway.group-ownership.spec.ts`
- `.harness/evidence/FF-12/summary.md`

## Verification

- PASS: `pnpm --filter @shugu/protocol run build && node --test packages/protocol/dist-protocol-out/*.spec.js`
- PASS: `pnpm test:node-core`
- PASS: `pnpm --filter @shugu/server run build && node --test apps/server/dist-out/**/*.spec.js`
- PASS: `pnpm --filter @shugu/sdk-manager run build && node --test packages/sdk-manager/dist-sdk-manager-out/*.spec.js`
- PASS: `pnpm validate:node-specs`
- PASS: `pnpm build:all`
- PASS: `pnpm verify`
- PASS: `git diff --check`

Evidence logs are under `.harness/evidence/FF-12/`.

## Review Notes

- `.looooper/workflow.yaml` remains modified but is outside this boundary and must stay untouched by FF-12.
- Work did not stage or commit.
- No visible UI route changed, so browser proof was not required.
