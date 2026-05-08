<!--
Purpose: Handoff record for the approved FF-18 GS-12 Node Graph deploy lane fix.
-->

# FF-18 GS-12 Deploy Lane Fix

Date: 2026-05-08

## Status

FF-18 remains incomplete. Do not start FF-19.

The approved GS-12 deploy lane is repaired: Node Graph loop deploy no longer uses explicit `clientIds` for scoped
mutating plugin commands, and the server accepts the managed client Group deploy path. The remaining GS-12 blocker is
runtime capability/product proof: the desktop e2e client used in browser verification does not advertise `flashlight`,
so live flashlight execution remains unproven.

## Changes

- Added managed per-client Group targeting for Node Graph loop lifecycle commands:
  `client:<clientId>`.
- Added a deploy preflight `node-executor/reclaim` before `node-executor/deploy` so the Manager owns the transferable
  managed client Group before mutating it.
- Registered normal clients without explicit `group` query into `client:<clientId>` on server connection.
- Added focused TDD coverage for Manager loop targeting, server managed Group registration, and server command-envelope
  acceptance.
- Updated FF-18 contract/evidence/status to include the approved lane and its runtime result.

## Validation

```text
corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts
PASS: 4 tests, 0 failures

corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.spec.ts
PASS: 7 tests, 0 failures

corepack pnpm@8.15.9 exec tsx --tsconfig apps/server/tsconfig.json --test apps/server/src/events/events.gateway.command-envelope.spec.ts
PASS: 11 tests, 0 failures

corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts
PASS: 13 tests, 0 failures

corepack pnpm@8.15.9 --filter @shugu/server run build
PASS

corepack pnpm@8.15.9 --filter @shugu/manager run build
PASS with existing Svelte/Sass/Rete warnings

python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS
```

```text
corepack pnpm@8.15.9 harness:verify
FAIL: known out-of-scope hotspot:
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492

corepack pnpm@8.15.9 verify
FAIL: same known out-of-scope hotspot after dependency guards, lint, build, node-core tests, FF-08 tests, FF-09 tests,
node spec validation, offline node-executor e2e, and FF-08 Manager boundary guard pass.
```

## Runtime Browser Evidence

Runtime was verified against current source on `https://localhost:3301`:

```text
PORT=3301 SHUGU_ALLOW_INSECURE_MANAGER=1 NODE_ENV=development corepack pnpm@8.15.9 --filter @shugu/server run dev
PASS: current source server starts.

chrome-devtools fetch https://localhost:3301/clients
PASS: normal clients are connected with managed groups such as group="client:c_ed172239e034".

chrome-devtools Manager /manager/root + Connect + Node Graph
PASS: Manager connects as manager and exposes window.__shuguNodeEngine.

chrome-devtools temporary GS-12 graph load
PASS: Manager detects one local loop requiring ["flashlight","sensors"].

chrome-devtools click Deploy
PASS: server accepts node-executor/reclaim with matching client:<clientId> target/scope.
PASS: server accepts node-executor/deploy with matching client:<clientId> target/scope.
BLOCKED: Manager reports "Deploy failed: missing required capabilities: flashlight".
PASS/BLOCKED: client e2e command capture shows no flashlight command executed after the capability rejection.
```

## Next Valid Step

Do not mark FF-18 complete. The next valid action is either:

- approve a bounded runtime/device capability proof lane for GS-12, or
- approve dated risk acceptance for missing GS-12 capability/device proof and other remaining FF-18 runtime proof, or
- keep FF-18 blocked.

Do not weaken security, policy, audit, rollback, ownership, or hotspot ratchets to make GS-12 pass.
