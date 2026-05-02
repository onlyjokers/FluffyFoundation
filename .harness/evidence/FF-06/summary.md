<!--
Purpose: Capture FF-06 server state strategy evidence for Review.
-->

# FF-06 Evidence Summary

## Chosen Strategy

Explicit single-server production mode.

## Changed Areas

- `apps/server/src/bootstrap/state-strategy.ts`: single-server strategy status and production boot guard.
- `apps/server/src/main.ts` and `apps/server/src/events/events.gateway.ts`: runtime validation and logs for active
  state strategy.
- `apps/server/src/client-registry/client-registry.service.ts`: registry-owned control-plane snapshot for selection
  and ownership.
- `apps/server/src/message-router/message-router.service.ts` and `apps/server/src/app.controller.ts`: status surfaces
  include strategy and snapshot.
- `packages/protocol/src/types.ts` and `packages/protocol/src/validation/other-messages.ts`: protocol contract accepts
  strategy and control-plane snapshot fields.
- `packages/sdk-manager/src/manager-sdk.ts`: manager adopts server snapshot selection and rejects silent divergence.
- `apps/manager/src/lib/stores/manager.ts` and `apps/manager/src/routes/+page.svelte`: dashboard shows server state
  strategy.
- `docs/harness/ADR-FF-06-server-state-strategy.md`: ADR for the chosen strategy and rollback path.

## Focused Proof

- RED proof: initial focused tests failed for missing `state-strategy`, missing registry snapshot, and missing manager
  snapshot reconciliation.
- GREEN proof: focused FF-06 tests passed after implementation:
  `TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm tsx --test apps/server/src/bootstrap/state-strategy.spec.ts apps/server/src/client-registry/client-registry.service.spec.ts && pnpm tsx --test packages/sdk-manager/src/state-snapshot.spec.ts packages/protocol/src/validation.spec.ts`.

## Required Checks

- `TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm tsx --test apps/server/src/bootstrap/state-strategy.spec.ts apps/server/src/client-registry/client-registry.service.spec.ts`
  - PASS: 4 tests passed.
- `pnpm tsx --test packages/sdk-manager/src/state-snapshot.spec.ts packages/protocol/src/validation.spec.ts`
  - PASS: 11 tests passed.
- `git diff --check`
  - PASS: no whitespace errors.
- `pnpm build:all`
  - PASS: all workspace builds completed. Existing Svelte/Rete/Sass warnings remain.
- `pnpm verify`
  - PASS: guard, lint, build, node-core tests, node-spec validation, offline executor e2e, and harness verification completed. Existing warnings remain in `packages/sdk-client/src/tone-adapter/types.ts`, Svelte/Rete/Sass output, and node-spec validation.
- Single-server guard runtime proof:
  - `SHUGU_ALLOW_INSECURE_MANAGER=1 PORT=3302 SHUGU_DEV_HOST=127.0.0.1 SHUGU_STATE_STRATEGY=shared pnpm --filter @shugu/server exec nest start --path tsconfig.dev.json`
  - PASS: boot exited 1 with `Production boot denied: SHUGU_STATE_STRATEGY must be single-server; shared state is not implemented.`
- Browser/runtime proof for dashboard status UI:
  - Server: `SHUGU_ALLOW_INSECURE_MANAGER=1 SHUGU_CORS_ORIGINS=https://localhost:5176 PORT=3303 pnpm dev:server`
  - Manager: `VITE_SHUGU_MANAGER_DEV_PASSWORD=ff06 pnpm dev:manager`
  - Playwright logged in as `Eureka`, connected to `https://localhost:3303`, and captured `.harness/evidence/FF-06/manager-server-state.png`.
  - PASS: dashboard showed `Server State`, `Mode` = `single-server`, `Registry` = `server-process`, and `Selection` = `server-process`.
- Socket/runtime snapshot proof:
  - PASS: manager socket received `clientList` with `stateStrategy.mode=single-server`, `registryOwner=server-process`, `selectionOwner=server-process`, `controlPlaneSnapshotOwner=server-process`, and `controlPlane.strategy=single-server`.
- `git status --short --branch`
  - PASS: `## master...origin/master [ahead 13]` with FF-06 modified source/status files and untracked source/ADR/test files. Evidence and handoff artifacts are present on disk but ignored by the repo's current `.gitignore`; Review must force-add them if they should be committed.

## Residual Risks

- This does not implement shared state. Production horizontal scaling remains intentionally unsupported until a later
  task adds a shared registry/control-plane store and convergence tests.
- Development can still use Redis adapter for local experiments, but production boot blocks the ambiguous mode.
