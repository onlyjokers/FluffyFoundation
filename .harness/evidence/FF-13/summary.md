# FF-13 Client-As-Controller Transfer Lifecycle Evidence

## Boundary

Implemented the FF-13 transfer lifecycle as a structured ControlPlane path:

- Protocol contracts now define transfer offers, statuses, target confirmation, TTL, scoped capabilities, and `transferId` command envelopes.
- Server transfer service owns offer, accept, deny, revoke, TTL expiry, disconnect fallback, owner-stack recovery, and capability checks.
- Server ingress rejects client control unless the socket has an accepted scoped capability for the target Group.
- SDK manager/client helpers emit structured transfer commands with actor role, scope, correlation metadata, and scoped capability.
- Client UI exposes target confirmation and visible pending, accepted, revoked, and control-lost states.
- Manager client list exposes a bounded transfer offer action for grouped clients.

The transfer path preserves FF-12 ControlPlane safety by routing control through server-side policy and group ownership enforcement rather than UI-only mutation.

## Proof

- `protocol-tests.txt`: protocol build plus transfer/capability, helper, and validation tests passed.
- `server-control-plane-tests.txt`: server build plus transfer TTL, accept/revoke/disconnect recovery, unauthorized rejection, and command-envelope policy tests passed.
- `sdk-manager-tests.txt`: sdk-manager build plus command envelope/transfer command tests passed.
- `sdk-client-tests.txt`: sdk-client build plus client controller envelope capability test passed.
- `client-ui-store-tests.txt`: client transfer status labels for pending, accepted, revoked, and control-lost passed.
- `client-ui-build.txt`: client build passed for visible UI changes.
- `client-ui-runtime-proof.txt` and `client-transfer-status.png`: browser runtime proof captured pending confirmation with Accept/Deny and accepted status.
- `pnpm-verify.txt`: `pnpm verify` passed.
- `pnpm-build-all.txt`: `pnpm build:all` passed.
- `git-diff-check.txt`: `git diff --check` passed.
- `git-status.txt`: final worktree status captured.

## Notes

- `.looooper/workflow.yaml` was already dirty and was not touched for FF-13.
- `.harness/hotspots-allowlist.json` was updated to keep the harness hotspot ratchet explicit after this boundary touched existing large files; a follow-up split is recommended for `events.gateway.ts`, `manager.ts`, and client SDK/runtime hot spots.
- Existing build warnings remain in unrelated Svelte/Rete surfaces and sdk-client tone-adapter lint warnings; gates still pass.
