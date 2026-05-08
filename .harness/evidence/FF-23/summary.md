<!--
Purpose: Record FF-23 security, supply-chain, release, and operations gate evidence.
-->

# FF-23 Evidence Summary

## Scope

Implemented an executable FF-23 release/security gate:

- Added `pnpm test:ff23`.
- Added `scripts/test-ff23-release-security.mjs` as the phase assertion entry.
- Added `scripts/ff23/release-security-gate.mjs` to generate a machine-readable release proof matrix.
- Added `scripts/security/scan-secrets.mjs` for tracked-file secret scanning.
- Added `scripts/ff23/validate-production-config.mjs` for production config validation.
- Added `scripts/ff23/backup-restore-drill.mjs` for a representative project/assets/state backup-restore drill.
- Added CI security checks for high-severity dependency audit, secret scan, and static policy gates.
- Added release operations docs and accepted-risk data under `docs/operations/`.
- Added explicit root `@eslint/js` dev dependency because the repo flat ESLint config imports it directly; this keeps
  repeatable clean installs from relying on an incidental transitive package layout.

No FF-24 dogfood launch work was started.

## TDD Evidence

RED:

```text
node scripts/test-ff23-release-security.mjs
FAIL Error [ERR_MODULE_NOT_FOUND]:
Cannot find module 'scripts/ff23/release-security-gate.mjs'
```

Second RED after the gate existed:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
'fail' !== 'pass'
```

GREEN:

```text
corepack pnpm@8.15.9 test:ff23
PASS
status=pass, 8 release/security checks
```

Dependency repeatability RED after a clean install:

```text
corepack pnpm@8.15.9 verify
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@eslint/js' imported from eslint.config.mjs
```

GREEN after declaring `@eslint/js`:

```text
corepack pnpm@8.15.9 verify
lint/build/tests/e2e pass; fails only at known hotspot ratchet
apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

## Proof Matrix

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dependency-review | release-operational | machine-checked-document | not-required-for-release-gate | `.github/workflows/ci.yml` | pass | none | FF-23 gate parses `pnpm audit --audit-level high --json`; no high/critical advisories; 14 low/moderate advisories recorded as dated accepted risks |
| secret-scan | release-operational | executable-local-check | not-required-for-release-gate | `scripts/security/scan-secrets.mjs` | pass | none | tracked text files scanned |
| codeql-equivalent | release-operational | machine-checked-document | not-required-for-release-gate | `.github/workflows/ci.yml` | pass | none | CI security job runs static policy gates |
| provenance-notes | release-operational | machine-checked-document | not-required-for-release-gate | `docs/operations/RELEASE.md` | pass | none | commit, lockfile, and evidence provenance required |
| production-config-validation | release-operational | executable-local-check | not-required-for-release-gate | `scripts/ff23/validate-production-config.mjs` | pass | none | production env gates are executable |
| backup-restore | release-operational | executable-local-check | not-required-for-release-gate | `scripts/ff23/backup-restore-drill.mjs` | pass | none | project/assets/state round-trip drill |
| release-candidate-checklist | release-operational | machine-checked-document | not-required-for-release-gate | `docs/operations/RELEASE.md` | pass | none | passed/failed/deferred/release-blocking states present |
| rollback-incident-procedure | release-operational | machine-checked-document | not-required-for-release-gate | `docs/operations/RELEASE.md` | pass | none | owner and revisit fields required |

Machine-readable artifacts:

- `.harness/evidence/FF-23/release-security-report.json`
- `.harness/evidence/FF-23/test-ff23-release-security-output.txt`
- `.harness/evidence/FF-23/pnpm-audit-output.json`

## Validation Results

- `corepack pnpm@8.15.9 test:ff23`: PASS, status=pass.
- `python3 .harness/scripts/validate_acceptance_contracts.py`: PASS.
- `git diff --check`: PASS.
- `corepack pnpm@10.20.0 audit --audit-level high --registry=https://registry.npmjs.org --json`: raw exit=1, with
  metadata `low=4`, `moderate=10`, `high=0`, `critical=0`; FF-23 gate accepts this only because every low/moderate
  advisory has a dated accepted-risk record and high/critical remains blocking.
- `corepack pnpm@8.15.9 verify`: FAIL only at exact known out-of-scope hotspot ratchet
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`; all preceding guard, lint, build,
  node-core, FF-08, FF-09, node-spec, offline e2e, and boundary checks pass.

## Stop-Condition Review

No stop condition remains triggered:

- Security scans pass under the FF-23 severity policy.
- No high, critical, blocking, or release-blocking accepted risks are present.
- Low/moderate accepted risks are dated `2026-05-09`, owned by `release-operator`, and expire before FF-24 final
  launch review or before the affected runtime exposure is introduced.
- Security, audit, rollback, policy, and hotspot boundaries were not weakened.
- Production deployment proof does not depend on FF-24 dogfood work.

FF-24 may start after final validation review.
