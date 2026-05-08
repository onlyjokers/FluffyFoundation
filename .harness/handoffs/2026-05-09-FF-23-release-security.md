<!--
Purpose: Handoff FF-23 security, supply-chain, release, and operations gate status.
-->

# FF-23 Release Security Handoff

## Status

FF-23 implementation is complete with focused release-operational proof.

Implemented inside the active contract lanes:

- `.github/workflows/ci.yml`
- `docs/operations/RELEASE.md`
- `docs/operations/ACCEPTED-RISKS.json`
- `scripts/security/scan-secrets.mjs`
- `scripts/ff23/release-security-gate.mjs`
- `scripts/ff23/validate-production-config.mjs`
- `scripts/ff23/backup-restore-drill.mjs`
- `scripts/test-ff23-release-security.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `.harness/evidence/FF-23/**`

## Verification

Focused check:

```text
corepack pnpm@8.15.9 test:ff23
PASS
```

Checked gates:

- dependency review
- secret scan
- CodeQL-equivalent static gates
- provenance notes
- production config validation
- backup/restore
- release candidate checklist
- rollback/incident procedure

Evidence:

- `.harness/evidence/FF-23/release-security-report.json`
- `.harness/evidence/FF-23/test-ff23-release-security-output.txt`
- `.harness/evidence/FF-23/pnpm-audit-output.json`
- `.harness/evidence/FF-23/summary.md`

## Notes

- `@eslint/js` is explicitly declared because `eslint.config.mjs` imports it directly; clean install verification
  failed until that dependency was declared instead of relying on an incidental transitive layout.
- `pnpm audit --audit-level high --json` currently exits 1 with low/moderate advisories only:
  `low=4`, `moderate=10`, `high=0`, `critical=0`.
- The 14 low/moderate audit advisories are recorded in `docs/operations/ACCEPTED-RISKS.json` with owner, date,
  missing proof, follow-up FF item, blocking severity, and expiry/revisit condition.
- High, blocking, or release-blocking accepted issues remain automatic blockers.
- Full `corepack pnpm@8.15.9 verify` runs through guard, lint, build, tests, node specs, offline e2e, and FF-08
  boundary checks, then fails only at the known out-of-scope hotspot ratchet:
  `apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492`.
- No FF-24 dogfood, documentation, or launch-readiness work was started.
- FF-24 may start after final validation review.
