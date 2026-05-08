<!--
Purpose: Handoff the approved FF-18 bounded product-proof lane fix and remaining acceptance blockers.
-->

# FF-18 Product-Proof Lane Handoff

Date: 2026-05-08

## Status

FF-18 remains incomplete. Do not start FF-19.

The user approved a bounded FF-18 product-proof lane revision on 2026-05-08. The lane fixed the Manager Published
Display control chain and produced real browser/runtime proof for that bounded path. It does not complete all FF-18
acceptance.

## Files Changed

- `.harness/goals/FF-18-review-contract.md`
- `packages/sdk-manager/src/command-envelope.ts`
- `packages/sdk-manager/src/delivery-queue.ts`
- `packages/sdk-manager/src/manager-sdk.ts`
- `packages/sdk-manager/src/manager-sdk.spec.ts`
- `apps/manager/src/lib/stores/group-controls.ts`
- `apps/manager/src/lib/stores/group-controls.spec.ts`
- `apps/manager/src/lib/components/PublishedGroupControls.svelte`
- `.harness/evidence/FF-18/runtime-browser-investigation.md`
- `.harness/evidence/FF-18/acceptance-reconciliation.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/2026-05-08-FF-18-product-proof-lane.md`

## Root Cause

The initial GS-13 product-chain attempt failed because Manager connected with `scopeGroupId=manager-performance` while
Published Group controls targeted `groupId=display`. Server policy correctly rejected that mismatch.

After fixing the target scope, the next reject was ownership policy: the `display` Group was owned by
`server-process`, so mutating controls needed an ownership transfer path. The fix kept server policy intact and made
the Manager Published Group control send `node-executor/reclaim` for the target Group before mutating controls.

## Proof

TDD:

```text
corepack pnpm@8.15.9 exec tsx --test packages/sdk-manager/src/manager-sdk.spec.ts
RED: group-targeted controls kept scopeGroupId=manager-performance.
GREEN: PASS, 13 tests.

corepack pnpm@8.15.9 exec tsx --test apps/manager/src/lib/stores/group-controls.spec.ts
RED: Published Group control emitted screenColor without reclaim.
GREEN: PASS, 4 tests.
```

Runtime/browser:

```text
browser-use Manager /manager/ -> Connect -> Display -> Send Color
PASS: server accepted node-executor/reclaim with scopeGroupId=display.
PASS: server accepted screenColor with scopeGroupId=display.
PASS: Display changed from black to a full-viewport blue-purple screen.
```

## Acceptance Impact

GS-13 is now partial instead of blocked: the bounded Manager Published Display product chain is proven. The full
breathing-like AI scenario and AI observation loop are still not product-proven.

GS-12 remains blocked because no stable audience client/device/output chain was proven.

Runtime override set/clear remains deferred as `RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED` without dated risk
acceptance.

## Stop Conditions Still Active

- Do not mark FF-18 complete from this product-chain proof alone.
- Do not start FF-19.
- Do not substitute deterministic fixtures for GS-12 runtime/browser/product proof.
- Do not weaken policy, validation, audit, rollback, redaction, dependency, or hotspot boundaries.
- Do not touch product/runtime paths outside the approved FF-18 contract without a new contract revision.
