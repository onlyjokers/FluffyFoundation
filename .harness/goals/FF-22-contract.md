<!--
Purpose: Define the Codex-ready task contract for FF-22 performance budgets, load, and show-mode resilience work.
-->

# FF-22 Performance Budgets, Load, And Show Mode Resilience Contract

## Objective

Prove the system holds under realistic device counts and failure conditions with explicit budgets and drill evidence.

## Scope

Allowed lanes:

- Budgets for latency, drop rate, CPU, memory, FPS, startup time, deploy time, and recovery time.
- Load harness for many clients and displays.
- Rehearsal mode and show mode configuration.
- Kill-switch and safe-mode drills for stopping media, clearing screens, stopping executors, revoking rogue
  controllers, and reconnecting.
- FF-22 evidence, handoff, and status updates after validation.

## Non-goals

- Do not start FF-23.
- Do not claim show-mode resilience from small deterministic tests alone.
- Do not weaken thresholds to pass.

## Acceptance criteria

- Budgets are explicit and linked to measured evidence.
- Load harness exercises realistic client/display counts; environment limits are automatic blockers unless the contract
  is revised before implementation.
- Drill evidence covers network interruption, display refresh, client reconnect, and Root stop-all.
- Failed budgets are fixed or marked as automatic stop conditions.
- Proof matrix lists measured values, thresholds, evidence paths, status, and release impact.

## Validation

Run load/drill commands defined by the implementation plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-22`
Completion decision: `complete | incomplete | stop`
Allowed paths: performance budget docs, load harnesses, rehearsal/show-mode configuration, kill-switch/safe-mode drill
evidence, `.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-22/**`
Forbidden paths: FF-23 security/release operations work, FF-24 dogfood launch work, threshold weakening without a
contract revision
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`, `release-operational`
Runtime/browser proof: `required-for-load-and-drill-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`
Adaptive execution policy: `disabled-by-default; contract revision required before combining scope expansion with implementation`

## Stop conditions

Stop and report if:

- Load proof cannot run in the available environment.
- Thresholds or ratchets must be weakened.
- Resilience proof would require starting FF-23 or FF-24.

## Final report

Report:

- FF-22 status.
- Files changed.
- Commands run and results.
- Budget and drill proof matrix.
- Release-blocking risks.
- Whether FF-23 may safely start.
