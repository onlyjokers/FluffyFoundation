<!--
Purpose: Record FF-21 evidence for executable golden scenario proof matrix work.
-->

# FF-21 Evidence Summary

## Scope

Implemented an executable FF-21 golden scenario suite:

- Added `buildFf21GoldenSuite` in `@shugu/ai-core` to produce a machine-checkable scenario proof matrix.
- Added `scripts/test-golden.mjs` to verify every required golden scenario is executable, non-manual, proven, and
  backed by an existing evidence path.
- Added `pnpm test:golden` as the phase command.
- Recorded pure JSON and full command output evidence under `.harness/evidence/FF-21/`.

No FF-22 performance budget, load harness, show-mode resilience, FF-23 security/release, or FF-24 dogfood work was
started.

## TDD Evidence

RED:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build && node scripts/test-golden.mjs
FAIL
SyntaxError: The requested module '../packages/ai-core/dist-ai-core/index.js' does not provide an export named
'buildFf21GoldenSuite'
```

Second RED for PLAN-required labels:

```text
node scripts/test-golden.mjs
FAIL
AssertionError: expected release and slow labels, got release only
```

GREEN:

```text
corepack pnpm@8.15.9 test:golden
PASS
9 scenarios, status=complete
```

Final validation:

```text
python3 .harness/scripts/validate_acceptance_contracts.py
PASS

git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All full-verify stages before `harness:hotspots` passed, including dependency guards, lint, build, node-core tests,
FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, FF-08 boundary guard, and harness structure
validation.

## Proof Matrix

| Scenario | Required proof type | Actual proof | Evidence path | Status | Label | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| Manager->Client | browser/runtime | FF-18 live Manager/Client/Server and explicit e2e proof lane | `.harness/evidence/FF-18/runtime-browser-investigation.md` | proven | slow | Uses existing runtime-browser evidence; not replaced by deterministic fixtures. |
| Root publish | browser/runtime | FF-08 Root/Manager browser route evidence and grouped controls | `.harness/evidence/FF-08/summary.md` | proven | slow | Root authoring and Manager published controls are separately proven. |
| Display fallback | product-runtime | FF-15 display fallback runtime proof fixture | `.harness/evidence/FF-15/summary.md` | proven | slow | Server fallback routing proof remains product-runtime evidence. |
| Asset preload | trace-replay | FF-16 preload/play/stop-all trace replay | `.harness/evidence/FF-16/runtime-upload-preload-play-stop-all.json` | proven | slow | Covers image, video, and audio readiness plus cleanup. |
| NodeExecutor deploy | CLI | Offline NodeExecutor deploy/stop/redeploy/remove e2e | `.harness/evidence/FF-13/pnpm-verify.txt` | proven | slow | Uses the existing executable lifecycle path. |
| ControlPlane transfer/reclaim | contract | FF-13 transfer lifecycle and scoped capability evidence | `.harness/evidence/FF-13/summary.md` | proven | release | Covers accept/revoke/disconnect recovery and owner-stack behavior. |
| AI graph edit | contract | FF-18 AI golden scenario fixtures and semantic command bus | `.harness/evidence/FF-18/summary.md` | proven | release | Keeps AI graph edit proof on semantic commands rather than UI mutation. |
| Rollback | contract | FF-19 audit/rollback evidence and node-core rollback behavior | `.harness/evidence/FF-19/summary.md` | proven | release | Includes rollback metadata, audit, and recovery semantics. |
| Show stop | trace-replay | FF-16 stop-all cleanup trace | `.harness/evidence/FF-16/runtime-upload-preload-play-stop-all.json` | proven | release | Clears media, sound, executor, and display cleanup hooks. |

Machine-readable artifacts:

- `.harness/evidence/FF-21/golden-suite.json`
- `.harness/evidence/FF-21/test-golden-output.txt`

## Stop-Condition Review

No stop condition remains triggered:

- Required browser/runtime scenarios link to browser/runtime evidence instead of deterministic fixtures.
- Manual-only scenarios are not marked complete.
- Slow and release labels are both present and machine-checked by `scripts/test-golden.mjs`.
- No CI changes were made.
- No FF-22 load/show-mode implementation, FF-23 security/release implementation, or FF-24 dogfood launch work was
  started.
- No deferred proof or dated risk acceptance was used.

FF-22 may start. The only remaining full-verify failure is the exact known out-of-scope hotspot baseline recorded before
FF-21 work.
