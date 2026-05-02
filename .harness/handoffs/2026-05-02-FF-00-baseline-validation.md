<!--
Purpose: Record FF-00 harness cutover validation evidence before Plan moves to FF-01.
-->

# FF-00 Baseline Validation Handoff

## Scope

- PLAN ID: `FF-00 - Harness Cutover And Baseline Freeze`
- Timestamp: `2026-05-02 23:04:29 CST`
- Boundary checked:
  - `docs/harness/**`
  - `.harness/**`
  - `.looooper/**`
  - `.github/pull_request_template.md`
  - `package.json`

## Validation Result

`pnpm harness:verify` passed.

Command evidence:

```text
> shugu3@1.0.0 harness:verify /Users/ziqi/Desktop/FluffyFoundation
> pnpm harness:validate && pnpm harness:hotspots && pnpm validate:node-specs

[harness] PASS: harness structure is valid
[hotspots] PASS: hotspot ratchet satisfied
node-specs 49 files, 26 warnings, 0 errors
```

Known warnings captured as baseline, not FF-00 blockers:

- `harness:validate` printed `validate_harness checks structure, not product correctness; run pnpm verify for product gates.`, then passed harness structure validation.
- `harness:hotspots` printed source hotspot warnings, then passed the ratchet.
- `validate:node-specs` printed 26 warnings for specs whose `runtime` field is ignored for node-core types, then exited with 0 errors.

## Baseline Package List

Current workspace packages from `apps/*/package.json` and `packages/*/package.json`:

- `apps/client/package.json` - `@shugu/client@1.0.0`
- `apps/display/package.json` - `@shugu/display@1.0.0`
- `apps/manager/package.json` - `@shugu/manager@1.0.0`
- `apps/server/package.json` - `@shugu/server@1.0.0`
- `packages/ai-core/package.json` - `@shugu/ai-core@1.0.0`
- `packages/audio-plugins/package.json` - `@shugu/audio-plugins@1.0.0`
- `packages/multimedia-core/package.json` - `@shugu/multimedia-core@1.0.0`
- `packages/node-core/package.json` - `@shugu/node-core@1.0.0`
- `packages/protocol/package.json` - `@shugu/protocol@1.0.0`
- `packages/sdk-client/package.json` - `@shugu/sdk-client@1.0.0`
- `packages/sdk-manager/package.json` - `@shugu/sdk-manager@1.0.0`
- `packages/ui-kit/package.json` - `@shugu/ui-kit@1.0.0`
- `packages/visual-effects/package.json` - `@shugu/visual-effects@1.0.0`
- `packages/visual-plugins/package.json` - `@shugu/visual-plugins@1.0.0`

## Git Status Summary

`git status --short --branch`:

```text
## master...origin/master
 M .github/pull_request_template.md
 M package.json
?? .harness/
?? .looooper/
?? docs/harness/
```

Expanded untracked status includes only:

- `.harness/evidence/.gitkeep`
- `.harness/handoffs/.gitkeep`
- `.harness/hotspots-allowlist.json`
- `.harness/scripts/check_hotspots.py`
- `.harness/scripts/validate_harness.py`
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.looooper/**`
- `docs/harness/**`

## Diff Summary

`git diff --stat` before this handoff:

```text
 .github/pull_request_template.md | 30 ++++++++++++++++++++++++++++--
 package.json                     |  6 ++++++
 2 files changed, 34 insertions(+), 2 deletions(-)
```

Tracked diff inspection:

- `.github/pull_request_template.md` changed from a Tone.js fix template to a harness-driven FF-ID template with sections for scope, product/architecture impact, harness evidence, AI operator impact, security/privacy impact, risk/rollback, and affected areas.
- `package.json` added `test:node-core`, `test:core`, `harness:validate`, `harness:hotspots`, `harness:verify`, and root `verify` scripts.

Untracked harness files supply the active plan, boundary docs, quality gates, verification docs, Looooper workflow/prompts/schemas, status pointers, hotspot ratchet config, and validation scripts.

## Boundary Compliance

Boundary check passed. Modified and untracked paths are inside the FF-00 Current Boundary:

- `.github/pull_request_template.md`
- `package.json`
- `.harness/**`
- `.looooper/**`
- `docs/harness/**`

No app/runtime/product source files under `apps/**`, `packages/**`, or `scripts/**` were modified in this FF-00 validation step.

## Baseline References

FF-00 baseline evidence references:

- `docs/PLAN_0109_MAJOR_GAPS_AND_SYSTEMIC_ISSUES.md`
- `docs/PROJECT_STRUCTURE_AND_ARCHITECTURE_DEEP_DIVE.md`

## Current CI Mismatch

The existing CI workflow still runs `pnpm build` on PRs targeting `main`, while the harness plan expects the future unified gate to be `pnpm verify` in FF-01. This is recorded as FF-01 work, not broadened into FF-00.

## Blockers

None for FF-00 harness validation. Plan may move to FF-01 after reviewing this handoff.
