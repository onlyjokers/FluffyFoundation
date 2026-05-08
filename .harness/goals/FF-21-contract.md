<!--
Purpose: Define the Codex-ready task contract for FF-21 executable golden scenario work.
-->

# FF-21 Executable Golden Scenarios Contract

## Objective

Convert product-readiness scenarios into executable proof without treating non-end-to-end fixtures as release
readiness.

## Scope

Allowed lanes:

- Playwright, CLI, contract, trace-replay, or load-test fixtures for golden scenarios.
- A phase command such as `pnpm test:golden` or equivalent if approved by the implementation scope.
- Scenario evidence under `.harness/evidence/FF-21/**` or CI artifacts.
- FF-21 handoff and status updates after validation.

## Non-goals

- Do not start FF-22.
- Do not mark manual-only scenarios as executable.
- Do not substitute deterministic fixtures for required browser/runtime proof.
- Do not change CI or package scripts unless the approved FF-21 implementation scope explicitly requires it.

## Acceptance criteria

- Golden scenarios are represented by executable Playwright, CLI, contract, trace-replay, or load-test fixtures.
- Each scenario stores or links evidence artifacts.
- Each scenario declares proof type: browser/runtime, CLI, contract, trace-replay, or load.
- Manual scenarios are incomplete for release readiness until converted into executable proof.
- Proof matrix maps each scenario to required proof, actual proof, evidence path, and status.

## Validation

Run the golden scenario command defined by the implementation plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-21`
Completion decision: `complete | incomplete | stop`
Allowed paths: golden scenario tests, browser/runtime scenario harnesses, CLI/contract/trace fixtures,
`.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-21/**`
Forbidden paths: FF-22 load/show-mode resilience implementation, FF-23 security/release implementation, FF-24 dogfood
launch work, unrelated product/runtime feature work
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`
Runtime/browser proof: `required-for-end-to-end-scenario-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`

## Stop conditions

Stop and report if:

- Required browser/runtime proof is replaced by contract fixtures.
- Adding scenario commands requires unapproved CI/test changes.
- Scenario failures lack actionable structured errors.

## Final report

Report:

- FF-21 status.
- Files changed.
- Commands run and results.
- Scenario-by-scenario proof matrix.
- Manual/deferred scenarios as automatic blockers.
- Whether FF-22 may safely start.
