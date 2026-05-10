Purpose: Evidence summary for the classic Manager topology rollback.

# FF-classic-manager-rollback Evidence

Date: 2026-05-10

## Acceptance mapping

- Classic topology restored:
  - Manager route now mounts `ManagerWorkspace` directly from `apps/manager/src/routes/+page.svelte`.
  - `/manager/root` route files are deleted.
  - Root-only authoring store and published-Group-only component are deleted.

- Manager is the only active human mutation surface:
  - `ManagerSDK` no longer exposes `offerClientControlTransfer` or `revokeClientControlTransfer`.
  - `ClientList.svelte` no longer exposes a client `Control` transfer button.
  - Server rejects mutating `role: 'client'` ingress with `server.policy.manager_required`.

- Root authority retired:
  - Server rejects mutating `role: 'root'` ingress with `server.policy.root_retired`.
  - Root emergency stop-all bypass was removed from `EventsGateway` and `group-ownership-policy`.
  - Protocol runtime role guard still returns false for `isControlPlaneActorRole('root')`.

- Client-as-controller retired from active product path:
  - Runtime protocol validation rejects `clientControlTransfer`.
  - Server transfer service implementation and module provider were removed.
  - `sdk-client` transfer command emission is a no-op compatibility shim.

## Validation commands

- `python3 .harness/scripts/validate_acceptance_contracts.py`
  - Result: PASS.

- `pnpm tsx --test packages/protocol/src/validation.spec.ts packages/protocol/src/control-plane.spec.ts packages/sdk-manager/src/manager-sdk.spec.ts apps/manager/src/routes/classic-manager-rollback.spec.ts apps/manager/src/lib/stores/group-controls.spec.ts packages/sdk-client/src/client-control-transfer.spec.ts`
  - Result: 37 tests passed.

- `pnpm --filter @shugu/server build`
  - Result: PASS.

- `node --test apps/server/dist-out/events/client-control-transfer.spec.js apps/server/dist-out/events/events.gateway.group-ownership.spec.js apps/server/dist-out/events/events.gateway.command-envelope.spec.js apps/server/dist-out/events/events.gateway.spec.js`
  - Result: 24 tests passed.

- `pnpm lint`
  - Result: PASS with pre-existing warnings in `packages/multimedia-core/src/multimedia-core.ts` and `packages/sdk-client/src/tone-adapter/types.ts`.

- `pnpm build:all`
  - Result: PASS with pre-existing Svelte/Rete/SvelteKit build warnings.

- `git diff --check`
  - Result: PASS.

- `rg -n "PublishedGroupControls|root-authoring|publishRootGroups|rootPublishedGroups|/manager/root|Fluffy Root|RootConnectPanel|RootWorkspace|ROOT_EMERGENCY|client_transfer_required|group\\.transfer" apps/manager/src apps/server/src/events apps/server/src/bootstrap packages/protocol packages/sdk-manager packages/sdk-client`
  - Result: only rollback regression test assertion strings remain.

## GitNexus

- Pre-edit impact checks were LOW for `EventsGateway`, `enforceGroupOwnership`, `isRootStopAll`, `ManagerSDK`, `ClientSDK`, `publishRootGroups`, `offerClientControlTransfer`, `sendClientControlCommand`, and `handleClientControlTransferCommand`.
- Final `gitnexus_detect_changes(scope=all)` reported high risk because this intentionally changes server ingress and protocol role/capability symbols. Affected flows were expected for this rollback and covered by focused server/protocol tests above.

## Stop conditions

None triggered. The only out-of-scope compile issue was historical `packages/node-core` type usage of `root.stopAll`; it was handled by keeping a protocol compile-compatibility capability while leaving Root absent from runtime capability grants and runtime role validation.
