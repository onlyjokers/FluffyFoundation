<!--
Purpose: Handoff FF-06 server state strategy implementation to Review.
-->

# FF-06 Work Handoff

## Decision

Chose explicit single-server production mode.

## Changed Areas

- Server boot/runtime checks reject production Redis broadcast or clustered process hints while state is
  process-local.
- Registry now emits a control-plane snapshot for selected clients and group ownership.
- Server status/log surfaces include the active state strategy.
- Protocol and manager SDK accept the strategy/snapshot fields.
- Manager SDK uses the server snapshot as selected-client truth and records an error on silent divergence.
- Manager dashboard shows the active server state mode and owners.
- ADR and evidence were added under `docs/harness/**` and `.harness/evidence/FF-06/**`.

## Checks

- PASS: `TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm tsx --test apps/server/src/bootstrap/state-strategy.spec.ts apps/server/src/client-registry/client-registry.service.spec.ts` (4 tests).
- PASS: `pnpm tsx --test packages/sdk-manager/src/state-snapshot.spec.ts packages/protocol/src/validation.spec.ts` (11 tests).
- PASS: `git diff --check`.
- PASS: `pnpm build:all` with existing Svelte/Rete/Sass warnings.
- PASS: `pnpm verify` with existing sdk-client `no-explicit-any`, Svelte/Rete/Sass, and node-spec warnings.
- PASS: single-server guard runtime proof rejected `SHUGU_STATE_STRATEGY=shared` at boot.
- PASS: browser/runtime proof captured `.harness/evidence/FF-06/manager-server-state.png`; dashboard showed `single-server`, `server-process`, and `server-process`.
- PASS: socket/runtime snapshot proof showed manager-visible `clientList` includes `stateStrategy` and `controlPlane` single-server ownership.
- PASS: `git status --short --branch`; evidence and handoff artifacts are ignored by current `.gitignore`, so Review must force-add them if committing these artifacts.

## Residual Risks

- No shared-state convergence behavior was added by design.
- Multi-instance production remains blocked until a later task approves shared registry/control-plane state.

## Rollback / Recovery

Operational recovery for a boot rejection is to run one server process and unset `REDIS_URL`, or set
`DISABLE_REDIS_ADAPTER=1` while keeping one production process. Code rollback should remove the FF-06 strategy guard
and snapshot fields only if Plan accepts reopening the Redis/local-truth ambiguity.
