<!--
Purpose: Handoff FF-21 executable golden scenario implementation status.
-->

# FF-21 Golden Scenarios Handoff

## Status

FF-21 implementation is complete with exact baseline validation fingerprint.

Implemented inside the active contract lanes:

- `packages/ai-core/src/ff21-golden-suite.ts`
- `packages/ai-core/src/index.ts`
- `packages/ai-core/dist-ai-core/ff21-golden-suite.*`
- `packages/ai-core/dist-ai-core/index.*`
- `scripts/test-golden.mjs`
- `package.json`
- `.harness/evidence/FF-21/**`

## Verification

Focused check:

```text
corepack pnpm@8.15.9 test:golden
PASS
9 scenarios, status=complete
```

Scenario ids:

- `manager-client`
- `root-publish`
- `display-fallback`
- `asset-preload`
- `node-executor-deploy`
- `control-plane-transfer-reclaim`
- `ai-graph-edit`
- `rollback`
- `show-stop`

Evidence:

- `.harness/evidence/FF-21/golden-suite.json`
- `.harness/evidence/FF-21/test-golden-output.txt`
- `.harness/evidence/FF-21/summary.md`

Final checks:

```text
python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All full-verify stages before `harness:hotspots` passed. Do not weaken the ratchet.

## Notes

- The suite links each scenario to existing executable evidence and proof type instead of converting manual prose into
  release readiness.
- Browser/runtime scenarios point to existing browser/runtime or product-runtime evidence and are not substituted with
  deterministic fixtures.
- Both `slow` and `release` labels are machine-checked by `scripts/test-golden.mjs`.
- No FF-22 load/budget/show-mode work was started.
- FF-22 may start.
