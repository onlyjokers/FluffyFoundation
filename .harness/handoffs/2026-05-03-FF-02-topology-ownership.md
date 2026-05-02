<!--
Purpose: Handoff FF-02 topology ownership and no-god-object ratchet implementation to Review.
-->

# FF-02 Handoff - Topology Ownership And No-God-Object Ratchets

## Summary

FF-02 is ready for Review. The work tightens architecture governance only; no runtime/UI behavior was intentionally
changed.

Implemented:

- froze current 400+ line source files in `.harness/hotspots-allowlist.json`;
- lowered unlisted hotspot blocking to 400 lines;
- expanded `scripts/guard-deps.mjs` from protocol/node-core checks to public-export, package dependency, and lane
  boundary checks;
- added root `CODEOWNERS` with Plan-approved placeholder `@shugu/*` ownership handles;
- documented new file/package topology policy and ADR requirements in `docs/harness/BOUNDARIES.md`;
- captured FF-02 evidence in `.harness/evidence/FF-02/summary.md`.

## Review Notes

- `CODEOWNERS` handles are placeholders only. Replace them with real GitHub teams/users before branch protection
  depends on CODEOWNERS.
- `apps/client` and `apps/display` currently import `@shugu/node-core` from source without declaring it in their
  `package.json`. FF-02 did not add lockfile/package changes because dependency updates were outside the approved
  scope. The lane guard permits this existing app-level edge but package workspaces remain declaration-checked.
- The temporary negative proof fixture was removed after the failing run.
- `.harness/evidence/FF-02/summary.md` and this handoff are ignored by the repo's current `.gitignore` patterns.
  Review must force-add them if committing the evidence/handoff is desired.

## Proof

Required proof run during Work:

- `pnpm harness:hotspots` - PASS
- `pnpm guard:deps` - PASS after implementation
- temporary invalid deep import fixture - FAILS as expected
- `pnpm guard:deps` - PASS after fixture removal

Additional proof should be checked in the final Work status:

- `pnpm verify` if practical
- `git diff --check`
- `git status --short --branch`

Final Work proof:

- `pnpm verify` - PASS, exit 0 with existing warnings
- `git diff --check` - PASS, exit 0
- `git status --short --branch` - PASS, branch `master...origin/master [ahead 5]`
