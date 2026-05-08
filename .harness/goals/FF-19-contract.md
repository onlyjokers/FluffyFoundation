<!--
Purpose: Define the Codex-ready task contract for FF-19 AI safety, policy, cost, redaction, and audit work.
-->

# FF-19 AI Safety, Policy, Cost, Redaction, And Audit Contract

## Objective

Implement FF-19 only after FF-18 is machine-complete. Keep creative AI powerful while preventing it
from becoming an unbounded mutation engine.

## Scope

Allowed lanes:

- AI policy classification for auto, approval-required, and denied commands.
- Redaction for secrets, tokens, raw private media paths, and unnecessary UI state.
- Cost/rate budget and model/provider abstraction contracts.
- Prompt-injection and tool-permission tests for node descriptions and external inputs.
- Audit records for prompt hash, snapshot revision, commands, validation, policy, approval, execution, observation, and
  rollback.
- FF-19 evidence, handoff, and status updates after validation.

## Non-goals

- Do not start FF-20.
- Do not bypass FF-18 semantic command-bus semantics.
- Do not add unapproved external provider calls or persistence.
- Do not weaken policy, redaction, audit, rollback, or security checks to pass tests.
- Do not claim runtime security proof from deterministic tests alone.

## Acceptance criteria

- AI commands are classified as auto, approval-required, or denied.
- Destructive/high-risk commands cannot execute without approval.
- Redaction proof shows secrets, tokens, raw private media paths, and irrelevant UI state are absent from AI-visible
  context.
- Cost/rate budgets and provider abstraction are bounded and testable.
- Prompt-injection-like node descriptions and external inputs are treated as inert data and cannot grant permissions.
- Audit trail records prompt hash, snapshot revision, commands, validation, policy, approval, execution, observation,
  and rollback.
- Proof matrix separates deterministic safety proof from runtime/security proof.

## Validation

Run task-specific AI safety/redaction/audit tests plus:

```bash
pnpm verify
git diff --check
```

## Machine contract

Contract ID: `FF-19`
Completion decision: `complete | incomplete | stop`
Allowed paths: `packages/ai-core/**`, `packages/node-core/**`, `docs/harness/AI-OPERATOR.md`,
`.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-19/**`
Forbidden paths: `apps/manager/**`, `apps/client/**`, `apps/display/**`, provider integration outside the active
contract, persistence engines, production deployment files
Required proof types: `implementation`, `deterministic`, `runtime-browser`, `product-runtime`
Runtime/browser proof: `required-for-security-and-runtime-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`

## Stop conditions

Stop and report if:

- FF-18 is not machine-complete.
- Provider, persistence, external network, or protocol changes are required without approved ADR/evidence.
- Passing requires weakening policy, redaction, audit, rollback, dependency, or security boundaries.
- Browser/runtime/security proof is being replaced by deterministic fixtures.

## Final report

Report:

- FF-19 status.
- Files changed.
- Commands run and results.
- Proof matrix for policy, redaction, cost, prompt-injection, and audit criteria.
- Runtime/security proof status and any automatic stop decision.
- Whether FF-20 may safely start.
