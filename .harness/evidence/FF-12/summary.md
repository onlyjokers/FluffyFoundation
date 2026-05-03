<!--
Purpose: Summarize FF-12 Group sovereignty and ControlPlane V2 implementation evidence for Review.
-->

# FF-12 Evidence Summary

## Boundary

Implemented one FF-12 boundary for Group sovereignty and ControlPlane V2:

- Shared ControlPlane actor/capability/Group ownership contract in `@shugu/protocol`.
- Semantic Group owner, owner stack, transferable flag, public/internal surface, visible-readonly policy, reclaim,
  release, archive, restore, and root stop-all command support in `@shugu/node-core`.
- Server-side Group ownership enforcement for mutating control/media/plugin commands.
- Control-plane snapshots now include Group ownership entries, not only selected client IDs.
- Manager SDK coverage for Group reclaim envelope propagation.

No visible Manager/Root UI behavior changed; browser/runtime proof was not required.

## Proof

- `pnpm --filter @shugu/protocol run build && node --test packages/protocol/dist-protocol-out/*.spec.js`
  - Evidence: `.harness/evidence/FF-12/protocol-tests.txt`
  - Result: 20 tests, 0 failures.
- `pnpm test:node-core`
  - Evidence: `.harness/evidence/FF-12/node-core-tests.txt`
  - Result: 45 tests, 0 failures.
- `pnpm --filter @shugu/server run build && node --test apps/server/dist-out/**/*.spec.js`
  - Evidence: `.harness/evidence/FF-12/server-tests.txt`
  - Result: 33 tests, 0 failures.
- `pnpm --filter @shugu/sdk-manager run build && node --test packages/sdk-manager/dist-sdk-manager-out/*.spec.js`
  - Evidence: `.harness/evidence/FF-12/sdk-manager-tests.txt`
  - Result: 11 tests, 0 failures.
- `pnpm validate:node-specs`
  - Evidence: `.harness/evidence/FF-12/validate-node-specs.txt`
  - Result: 49 files, 26 existing warnings, 0 errors.
- `pnpm build:all`
  - Evidence: `.harness/evidence/FF-12/build-all.txt`
  - Result: passed with existing Svelte/Vite warnings.
- `pnpm verify`
  - Evidence: `.harness/evidence/FF-12/pnpm-verify.txt`
  - Result: passed with existing hotspot and node-spec warnings.
- `git diff --check`
  - Evidence: `.harness/evidence/FF-12/git-diff-check.txt`
  - Result: passed.
- `git status --short --branch`
  - Evidence: `.harness/evidence/FF-12/git-status.txt`

## Notes For Review

- `.looooper/workflow.yaml` was already modified in the worktree and remains outside this FF-12 boundary. Work did not
  stage or commit anything.
- `pnpm --filter @shugu/protocol run test` is not available because `@shugu/protocol` has no `test` script; the
  protocol package was built and its compiled specs were run directly.
- The AI actor capability path is explicit and proposal-only for mutations; it does not grant direct Canvas/Rete
  mutation or secret access.
