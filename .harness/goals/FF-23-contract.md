<!--
Purpose: Define the Codex-ready task contract for FF-23 security, supply-chain, release, and operations work.
-->

# FF-23 Security, Supply Chain, Release, And Operations Contract

## Objective

Make production deployment repeatable and defensible through security, supply-chain, release, and operations gates.

## Scope

Allowed lanes:

- Security workflows for dependency review, secret scanning, CodeQL or equivalent, and provenance notes.
- Production config validation and deployment checklist.
- Backup/restore strategy for projects, assets, and state.
- Release train with version, migration, rollback, and incident procedure.
- FF-23 evidence, handoff, and status updates after validation.

## Non-goals

- Do not start FF-24.
- Do not treat checklist prose as passing security proof.
- Do not weaken security, audit, rollback, or release gates to pass.

## Acceptance criteria

- Dependency review, secret scanning, CodeQL-equivalent, and provenance notes are present.
- Production config validation is executable.
- Backup/restore strategy is documented and testable.
- Release candidate checklist distinguishes passed, failed, deferred, and release-blocking items.
- Security scans pass; accepted issues with owners, dates, severity, and revisit conditions are automatic blockers when
  severity is high, blocking, or release-blocking.

## Validation

Run security/release validation commands defined by the implementation plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-23`
Completion decision: `complete | incomplete | stop`
Allowed paths: security workflow configuration, release checklist, production config validation, backup/restore docs
and tests, `.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-23/**`
Forbidden paths: FF-24 dogfood launch work, security/audit/rollback weakening, production deployment proof that depends
on uncompleted dogfood work
Required proof types: `implementation`, `deterministic`, `product-runtime`, `release-operational`
Runtime/browser proof: `required-for-release-ui-or-runtime-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`

## Stop conditions

Stop and report if:

- Security scans fail.
- Release process requires weakening audit, rollback, security, or policy.
- Production deployment proof requires FF-24 dogfood work.

## Final report

Report:

- FF-23 status.
- Files changed.
- Commands run and results.
- Security and release proof matrix.
- Accepted issues as automatic blockers when the severity matrix requires stop.
- Whether FF-24 may safely start.
