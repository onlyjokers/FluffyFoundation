<!--
Purpose: Define the Codex-ready task contract for FF-24 dogfood, documentation, and production launch readiness work.
-->

# FF-24 Dogfood, Documentation, And Production Launch Readiness Contract

## Objective

Exit the harness only after real rehearsal workflows pass repeatedly and final launch readiness is machine-proven.

## Scope

Allowed lanes:

- Operator manual for Root, Manager, Client, Display, AI Operator, rehearsal, show mode, recovery, and troubleshooting.
- Developer guide for adding nodes, plugins, and connectors with registry, validation, tests, and AI descriptions.
- Dogfood rehearsal logs across multiple sessions.
- Final launch review that closes all critical risks or lists automatic blockers.
- FF-24 evidence, handoff, and final status updates after validation.

## Non-goals

- Do not implement missing FF-18 through FF-23 product work.
- Do not mark production ready with release-blocking risks open.
- Do not treat synthetic or deterministic-only evidence as dogfood proof.

## Acceptance criteria

- Full golden suite passes on a release candidate.
- At least two rehearsal/dogfood reports show stable operation and documented recovery.
- Operator manual covers Root, Manager, Client, Display, AI Operator, rehearsal, show mode, recovery, and
  troubleshooting.
- Developer guide covers nodes, plugins, connectors, registry, validation, tests, and AI descriptions.
- Final phase review states production ready or lists explicit blockers.
- No prior `FF-*` item remains incomplete.

## Validation

Run full golden/release validation commands available at this phase plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-24`
Completion decision: `complete | incomplete | stop`
Allowed paths: operator manual, developer guide, dogfood rehearsal logs, launch review evidence, final harness status,
`.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-24/**`
Forbidden paths: missing FF-18 through FF-23 product implementation, production-ready claims with open risks,
security/audit/rollback weakening
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`, `release-operational`
Runtime/browser proof: `required-for-dogfood-and-launch-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`
Adaptive execution policy: `disabled-by-default; contract revision required before combining scope expansion with implementation`

## Stop conditions

Stop and report if:

- Any FF-18 through FF-23 item remains incomplete.
- Dogfood evidence is missing, synthetic-only, or not tied to recovery notes.
- Release-blocking risks remain open.
- Launch readiness requires product work outside FF-24 documentation/dogfood scope.

## Final report

Report:

- FF-24 status.
- Files changed.
- Commands run and results.
- Launch-readiness proof matrix.
- Dogfood report paths.
- Final production-ready or blocked decision with explicit blockers.
