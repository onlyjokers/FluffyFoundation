<!--
Purpose: Request an explicit FF-18 contract revision before product-chain code is changed.
-->

# FF-18 Contract Revision Request

Date: 2026-05-08

## Objective

Revise the active FF-18 contract before any additional product/runtime code is changed, so the remaining GS-12
runtime/browser/product proof can be pursued without violating the current acceptance boundary.

## Why Revision Is Required

Earlier 2026-05-08 evidence showed FF-18 could not be completed inside the original active contract:

- GS-12 needed a stable audience client/device/output runtime path for gyro-to-flashlight proof.
- GS-13 needed Manager-to-Display product control to produce a visible output change.
- Browser-use verified Manager and Display can be operated, but Display output remains black after Manager Send Color.
- Server logs reject the Display command with `server.policy.scope_mismatch` at `target.groupId`.
- Root cause traced read-only: Manager connects with `scopeGroupId: 'manager-performance'`, while Published Group
  Controls target `{ mode: 'group', groupId: 'display' }`; server requires target group to match command scope.

The first approved product-proof lane fixed the bounded GS-13 Manager Published Display control path. It did not
complete FF-18 because full GS-13 breathing-like AI observation and GS-12 gyro-to-flashlight runtime proof remain
unproven.

Latest 2026-05-08 GS-12 runtime recheck narrows the remaining blocker:

- browser-use can open the client e2e page.
- `/clients` reports a normal audience client connected.
- chrome-devtools can log into Manager, open Node Graph, and access `window.__shuguNodeEngine`.
- a runtime-only GS-12-shaped graph can be loaded:
  `client-object -> proc-client-sensors gyroG -> proc-flashlight frequencyHz -> client-object`.
- Manager detects a local loop requiring `flashlight` and `sensors`.
- clicking Deploy is rejected by server policy:
  `server.policy.scope_mismatch`, `path=target.mode`,
  `message="scoped commands must target their scope group"`.

The current active contract forbids the likely remaining GS-12 fix paths:

- `apps/server/**`
- `apps/client/**`
- `apps/display/**`
- `apps/manager/src/lib/components/nodes/**`

The active FF-18 contract explicitly lists `apps/manager/src/lib/components/nodes/**` as forbidden, so Codex must not
change Node Graph loop deployment without explicit approval.

## Proposed Contract Amendment

Add a narrowly scoped FF-18 GS-12 deployment product-proof lane.

Allowed additional paths:

- `.harness/goals/FF-18-review-contract.md`
- `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.ts`
- `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`
- `apps/server/src/events/events.gateway.ts`
- `apps/server/src/events/events.gateway.command-envelope.spec.ts`
- `apps/server/src/events/group-ownership-policy.ts`
- `packages/sdk-manager/src/command-envelope.ts`
- `packages/sdk-manager/src/manager-sdk.ts`
- `packages/sdk-manager/src/manager-sdk.spec.ts`
- `.harness/evidence/FF-18/**`
- `.harness/handoffs/**`
- `.harness/status/current-task.md`

The amendment should not allow broad server rewrites, provider integration, persistence changes, dependency boundary
weakening, security/policy/audit/rollback weakening, display/client runtime changes, or FF-19 work.

## TDD Plan After Approval

1. Write a failing `loop-helpers` unit test proving deploy/stop/remove loop actions must not emit a scoped manager
   mutating command with `target.mode=clientIds` when the active server policy rejects that target mode.
2. Write or update a failing SDK/server policy test that captures the intended minimal target/scope contract for
   Node Graph loop deployment without weakening existing group-scope enforcement.
3. Run the focused tests and confirm they fail for the current `target.mode=clientIds` deploy path.
4. Implement the smallest code change that lets Node Graph loop deployment pass the existing server policy while
   preserving actor, role, audit, ownership, rollback, and existing Group-scope enforcement.
5. Re-run focused tests:
   - `corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`
   - `corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts`
   - `corepack pnpm@8.15.9 exec tsx --test apps/server/src/events/events.gateway.command-envelope.spec.ts`
6. Run broader FF-18 validation:
   - `corepack pnpm@8.15.9 --filter @shugu/ai-core run build`
   - `corepack pnpm@8.15.9 --filter @shugu/node-core run build`
   - `node --test packages/ai-core/test/*.test.mjs`
   - `node --test packages/node-core/test/semantic-command-bus.test.mjs`
   - `node --test packages/node-core/test/group-ownership-policy.test.mjs`
   - `corepack pnpm@8.15.9 validate:node-specs`
   - `corepack pnpm@8.15.9 harness:validate`
   - `python3 .harness/scripts/validate_acceptance_contracts.py`
   - `git diff --check`
   - `corepack pnpm@8.15.9 verify`
7. Start the local runtime with explicit local manager authorization.
8. Use browser-use/chrome-devtools to verify:
   - Manager can connect as a manager.
   - a normal audience client remains connected.
   - Manager Node Graph can load the GS-12 runtime graph.
   - Deploy no longer produces `server.policy.scope_mismatch`.
   - client e2e command evidence records a `flashlight` command whose frequency comes from the gyro path.
9. Update FF-18 evidence, proof matrix, status, and handoff.
10. Commit only the approved-scope files.

## Stop Conditions After Approval

Stop again if:

- the fix requires weakening server policy, audit, rollback, redaction, dependency, or hotspot gates;
- a required change expands beyond the approved amendment;
- tests cannot reproduce the observed deploy policy mismatch before implementation;
- runtime/browser proof still cannot produce client e2e `flashlight` command evidence after tests pass;
- GS-12 requires real device/browser APIs that cannot be simulated or proven by an approved runtime harness;
- the fix requires `apps/client/**`, `apps/display/**`, provider work, persistence work, or FF-19 scope;
- `pnpm verify` fails with a non-baselined or newly introduced failure.

## Requested Approval

Approve one of:

- Revise FF-18 contract for this bounded GS-12 deploy product-proof lane and proceed with TDD implementation.
- Reject the amendment and keep FF-18 blocked.
- Accept dated risk for missing GS-12 proof instead of fixing the product chain now.
