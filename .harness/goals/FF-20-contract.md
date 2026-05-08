<!--
Purpose: Define the Codex-ready task contract for FF-20 observability, reporting, and operator console work.
-->

# FF-20 Observability, Reporting, And Operator Console Contract

## Objective

Make failures visible, structured, and actionable during a show through observability, reporting, and operator-console
proof.

## Scope

Allowed lanes:

- Structured events for validation errors, permission denials, transport failures, node executor status, display
  status, asset readiness, AI proposals, and rollback.
- Metrics for latency, traffic, errors, saturation, drops, FPS, audio readiness, device capability, and command
  outcomes.
- Operator console surfaces for health, active partitions, connected devices, failed commands, pending transfers, and
  kill-switch state.
- Scenario artifacts proving diagnosis of at least one failed display update from structured reports.
- FF-20 evidence, handoff, and status updates after validation.

## Non-goals

- Do not start FF-21.
- Do not implement FF-22 load/show-mode budgets.
- Do not hide runtime failures behind UI-only state.
- Do not treat event type declarations as operator-console runtime proof.

## Acceptance criteria

- Structured reports exist for the required failure and status categories.
- Metrics exist for the required readiness, traffic, latency, saturation, and command-outcome categories.
- Operator console exposes actionable health and failure state to the operator.
- Reviewer can diagnose a failed display update from structured reports and linked evidence.
- Proof matrix separates static event/metric tests from runtime/browser/operator-console proof.

## Validation

Run task-specific observability and operator-console checks plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-20`
Completion decision: `complete | incomplete | stop`
Allowed paths: observability/reporting code, operator-console surfaces, structured report tests,
`.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-20/**`
Forbidden paths: FF-21 golden scenario implementation, FF-22 load/show-mode budget implementation, security/release
work reserved for FF-23, dogfood launch work reserved for FF-24
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`
Runtime/browser proof: `required-for-operator-console-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`
Adaptive execution policy: `disabled-by-default; contract revision required before combining scope expansion with implementation`

## Stop conditions

Stop and report if:

- Runtime/browser diagnosis proof is required but missing.
- Completing console proof requires FF-21, FF-22, or broader product work outside the contract.
- Structured failures would be hidden, downgraded, or made UI-only.

## Final report

Report:

- FF-20 status.
- Files changed.
- Commands run and results.
- Proof matrix for events, metrics, console state, and failed-display diagnosis.
- Runtime/browser proof paths and automatic stop decisions.
- Whether FF-21 may safely start.
