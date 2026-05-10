<!--
Purpose: Define the Codex-ready task contract for reverting Root and client-as-controller control-plane changes back to the classic Manager/Client/Display/Server topology.
-->

# FF Classic Manager Topology Rollback Contract

## Objective

Return FluffyFoundation to the classic topology where Manager is the only human control and authoring surface, Server
routes and validates, and Client/Display remain runtime endpoints without Root or client-as-controller authority.

## Scope

Allowed lanes:

- Manager UI and route structure under `apps/manager/**`, including moving authoring controls back to `/manager/` and
  retiring `/manager/root`.
- Manager stores/components that exist only to support Root splitting, published-Group-only Manager mode, or
  client-as-controller transfer controls.
- Server ingress and policy code under `apps/server/src/events/**` and `apps/server/src/bootstrap/**` only where needed
  to remove Root authority and client-as-controller mutation paths while preserving manager authentication.
- Shared protocol/SDK contracts under `packages/protocol/**`, `packages/sdk-manager/**`, and `packages/sdk-client/**`
  only where needed to remove Root/control-transfer types, envelopes, validation branches, and tests.
- Harness docs/evidence/status for this rollback under `.harness/goals/**`, `.harness/evidence/FF-classic-manager-rollback/**`,
  `.harness/handoffs/**`, and `docs/harness/**`.

## Non-goals

- Do not redesign the client experience, display visuals, media playback, sensor capture, node runtime, local display
  bridge, or plugin architecture except where direct coupling to Root/control-transfer must be removed.
- Do not add a new role model, RBAC system, workspace model, multi-manager model, or replacement "Root" concept.
- Do not weaken server-side manager authentication or production security policy.
- Do not rewrite unrelated FF-18 through FF-24 evidence or claim a new production launch state.
- Do not include dependency upgrades, formatter churn, generated build output, or unrelated `.looooper` workflow changes.

## Acceptance criteria

- `/manager/` is the single product control surface for authoring, client selection, display controls, node graph/project
  work, operator controls, and connection to Server.
- `/manager/root` is removed, redirected, or otherwise non-product-facing, and no navigation points users to Root.
- No active product code grants mutation authority to `role: 'root'` or uses Root-specific emergency authority.
- No active product code allows a client to become a manager-like controller through client-control-transfer acceptance.
- Server still distinguishes authenticated Manager connections from ordinary Client/Display runtime connections.
- Client and Display can still connect as runtime endpoints and receive Manager-originated commands.
- Existing media, sensor, local display, node runtime, and display routing capabilities remain intact unless direct
  Root/control-transfer coupling is removed with focused tests.
- Obsolete Root/control-transfer docs, tests, and harness references are either removed, rewritten as historical notes,
  or explicitly marked out of active product scope.
- A rollback evidence summary records changed files, removed surfaces, retained runtime behavior, validation commands,
  and any known residual references.

## Validation

Required validation, unless a stop condition is triggered first:

```bash
python3 .harness/scripts/validate_acceptance_contracts.py
git diff --check
pnpm lint
pnpm build:all
```

Also run focused tests for every changed protocol, server policy, manager store, SDK, or client/display runtime module.
If a changed area lacks a focused test, add the smallest regression test that proves the rollback behavior.

For UI/runtime proof, run the app stack and capture browser/runtime evidence showing:

- Manager opens at `/manager/`.
- No Root navigation or Root login/connect screen is exposed.
- Manager can connect to Server with the configured manager key path.
- At least one Client or Display runtime endpoint can connect or the failure is recorded with an exact environment
  fingerprint.

## Machine contract

Contract ID: `FF-classic-manager-rollback`
Completion decision: `complete | incomplete | stop`
Allowed paths: `apps/manager/**`, `apps/server/src/events/**`, `apps/server/src/bootstrap/**`, `packages/protocol/**`,
`packages/sdk-manager/**`, `packages/sdk-client/**`, `docs/harness/**`, `.harness/goals/**`,
`.harness/evidence/FF-classic-manager-rollback/**`, `.harness/handoffs/**`, `.harness/status/**`
Forbidden paths: unrelated client/display visual redesign, dependency upgrades, generated build output, unrelated
`.looooper/**` changes, unrelated FF-18 through FF-24 evidence rewrites, security/auth weakening
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`
Runtime/browser proof: `required-for-manager-route-and-runtime-connection-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires user approval; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && git diff --check && pnpm lint && pnpm build:all`
Adaptive execution policy: `enabled-for-this-contract-only; stop on HIGH/CRITICAL GitNexus impact, auth weakening, protocol ambiguity, or runtime proof failure`

## Stop conditions

Stop and report if:

- GitNexus impact analysis for a planned symbol edit returns HIGH or CRITICAL risk.
- Removing Root/control-transfer requires redesigning client, display, media, sensor, node runtime, local display bridge,
  or plugin architecture beyond direct coupling cleanup.
- Server-side manager authentication would become weaker than the current `SHUGU_MANAGER_KEY` / local-dev policy.
- Runtime evidence cannot prove Manager remains usable and Client/Display remain runtime endpoints.
- Existing working client behavior breaks and cannot be repaired inside the allowed lanes with focused tests.
- Validation fails without an exact pre-existing failure fingerprint.
- The rollback needs dependency upgrades, schema migrations, or deployment changes not explicitly approved by the user.

## Final report

Report:

- Final state: `complete`, `incomplete`, or `stop`.
- Files changed, grouped by Manager, Server, Protocol/SDK, Client/Display touch points, and Harness.
- Root surfaces removed or retired.
- Client-as-controller transfer paths removed or disabled.
- Classic topology proof: Manager, Server, Client, Display responsibilities after rollback.
- Commands run and pass/fail results.
- Browser/runtime evidence paths.
- GitNexus impact and detect-changes summary.
- Residual risks or references that remain intentionally historical.
