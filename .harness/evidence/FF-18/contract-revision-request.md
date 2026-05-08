<!--
Purpose: Request an explicit FF-18 contract revision before product-chain code is changed.
-->

# FF-18 Contract Revision Request

Date: 2026-05-08

## Objective

Revise the active FF-18 contract before any product/runtime code is changed, so GS-12 and GS-13 runtime/browser/product
proof can be pursued without violating the current acceptance boundary.

## Why Revision Is Required

Current evidence shows FF-18 cannot be completed inside the active contract:

- GS-12 needs a stable audience client/device/output runtime path for gyro-to-flashlight proof.
- GS-13 needs Manager-to-Display product control to produce a visible output change.
- Browser-use verified Manager and Display can be operated, but Display output remains black after Manager Send Color.
- Server logs reject the Display command with `server.policy.scope_mismatch` at `target.groupId`.
- Root cause traced read-only: Manager connects with `scopeGroupId: 'manager-performance'`, while Published Group
  Controls target `{ mode: 'group', groupId: 'display' }`; server requires target group to match command scope.

The active contract currently forbids the likely fix paths:

- `apps/server/**`
- `apps/client/**`
- `apps/display/**`
- `apps/manager/src/lib/components/nodes/**`

It also does not list `.harness/goals/FF-18-review-contract.md` as an allowed edit path, so Codex must not silently
revise the contract without explicit approval.

## Proposed Contract Amendment

Add a narrowly scoped FF-18 product-proof lane:

Allowed additional paths:

- `.harness/goals/FF-18-review-contract.md`
- `apps/manager/src/routes/+page.svelte`
- `apps/manager/src/lib/stores/group-controls.ts`
- `apps/manager/src/lib/stores/group-controls.spec.ts`
- `packages/sdk-manager/src/manager-sdk.ts`
- `packages/sdk-manager/src/manager-sdk.spec.ts`
- `apps/server/src/events/events.gateway.ts`
- `apps/server/src/events/events.gateway.command-envelope.spec.ts`
- `apps/server/src/events/group-ownership-policy.ts`
- `apps/server/src/events/display-routing.spec.ts`
- `.harness/evidence/FF-18/**`
- `.harness/handoffs/**`
- `.harness/status/current-task.md`

The amendment should not allow broad server rewrites, provider integration, persistence changes, dependency boundary
weakening, security/policy/audit/rollback weakening, or FF-19 work.

## TDD Plan After Approval

1. Write a failing unit test proving Manager published group controls create an envelope whose `scopeGroupId` matches
   the target group when sending a scoped Group command.
2. Run the focused test and confirm it fails with the current `manager-performance`/`display` mismatch.
3. Implement the smallest code change that lets a scoped published group command carry the target group scope while
   preserving actor, role, audit, and existing audience control behavior.
4. Run the focused Manager/SDK tests until they pass.
5. If server policy behavior needs adjustment, write the failing server policy test first and only then implement the
   minimal policy fix.
6. Re-run focused tests:
   - `pnpm tsx --test apps/manager/src/lib/stores/group-controls.spec.ts`
   - `pnpm --filter @shugu/sdk-manager run test`
   - `pnpm --filter @shugu/server run test`
7. Run broader FF-18 validation:
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
8. Start the local runtime with explicit local manager authorization.
9. Use browser-use/chrome-devtools to verify:
   - Manager can connect as a manager.
   - Display registers as `group=display`.
   - Manager Display Send Color changes the visible Display output.
   - Server logs no `server.policy.scope_mismatch` for that command.
10. Attempt GS-12 proof only if the audience client/device/output path can be proven without new out-of-contract scope.
11. Update FF-18 evidence, proof matrix, status, and handoff.
12. Commit only the approved-scope files.

## Stop Conditions After Approval

Stop again if:

- the fix requires weakening server policy, audit, rollback, redaction, dependency, or hotspot gates;
- a required change expands beyond the approved amendment;
- tests cannot reproduce the observed policy mismatch before implementation;
- runtime/browser proof still cannot produce a visible Display output after tests pass;
- GS-12 requires real device/browser APIs that cannot be simulated or proven by an approved runtime harness;
- `pnpm verify` fails with a non-baselined or newly introduced failure.

## Requested Approval

Approve one of:

- Revise FF-18 contract for this bounded product-proof lane and proceed with TDD implementation.
- Reject the amendment and keep FF-18 blocked.
- Accept dated risk for missing GS-12/GS-13 proof instead of fixing the product chain now.
