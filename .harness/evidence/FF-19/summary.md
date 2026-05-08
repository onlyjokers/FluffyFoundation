<!--
Purpose: Record FF-19 evidence for AI safety, policy, cost, redaction, and audit contract work.
-->

# FF-19 Evidence Summary

## Scope

Implemented deterministic AI safety contract hardening inside `@shugu/ai-core`:

- `classifyAiProposalSafety` classifies proposal commands as `auto`, `approval-required`, or `denied`.
- Cost/rate/provider budget checks deny over-budget proposal execution without making provider or network calls.
- Prompt-injection-like node descriptions and external inputs are detected as inert data; they do not mutate policy
  allowlists or grant permissions.
- Redaction now covers bearer-style tokens in addition to secret-like keys, private paths, and UI/layout noise.
- AI proposal execution audit records prompt hash, snapshot revision, validation, policy, approval, execution,
  observation, and rollback metadata.

No provider integration, persistence engine, app runtime, deployment, or FF-20 observability console work was started.

## TDD Evidence

RED:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run test -- safety-contract
FAIL
SyntaxError: The requested module '../dist-ai-core/index.js' does not provide an export named
'classifyAiProposalSafety'
```

GREEN:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run test -- safety-contract
PASS
29 tests, 0 failures
```

Focused validation:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run lint
PASS

python3 .harness/scripts/validate_acceptance_contracts.py
PASS
```

Final validation:

```text
git diff --check
PASS

corepack pnpm@8.15.9 verify
FAIL only at known exact hotspot baseline:
- apps/server/src/assets/assets.service.ts: 498 lines exceeds ratchet max 492
```

All `verify` stages before `harness:hotspots` passed, including dependency guards, lint, build, node-core tests,
FF-08 tests, FF-09 tests, node spec validation, offline node-executor e2e, FF-08 boundary guard, and harness structure
validation. The initial FF-19 browser build regression from importing `node:crypto` in the shared AI package was fixed
before final validation by moving prompt hashing to a browser-safe helper. The temporary AI-core hotspot regression was
fixed by extracting prompt hashing into `packages/ai-core/src/prompt-hash.ts`; `proposal-execution.ts` is now 381 lines
and is warning-only.

## Proof Matrix

| Criterion | Required proof type | Deterministic/unit proof | Runtime/browser proof | Evidence path | Status | Deferred risk acceptance | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AI commands classified as auto, approval-required, or denied | deterministic | `packages/ai-core/test/safety-contract.test.mjs` | N/A - no runtime/UI claim | `.harness/evidence/FF-19/summary.md` | proven | N/A | Covers allowed, approval-required, denied, and unknown/over-budget denial behavior. |
| Destructive/high-risk commands cannot execute without approval | deterministic | `packages/ai-core/test/safety-contract.test.mjs`; existing `packages/ai-core/test/proposal-execution.test.mjs` | N/A - existing execution core uses injected semantic bus only | `.harness/evidence/FF-19/summary.md` | proven | N/A | `partition.stop.all` remains denied under policy even when prompt text asks for root permission. |
| Redaction removes secrets, tokens, raw private media paths, and irrelevant UI state | deterministic | `packages/ai-core/test/safety-contract.test.mjs`; `packages/ai-core/test/semantic-context.test.mjs` | N/A - model context is deterministic data packaging | `.harness/evidence/FF-19/summary.md` | proven | N/A | Bearer token, private media path, selected/viewport/panel state removed before AI visibility. |
| Cost/rate budgets and provider abstraction are bounded and testable | deterministic | `packages/ai-core/test/safety-contract.test.mjs` | N/A - no provider/network integration allowed by contract | `.harness/evidence/FF-19/summary.md` | proven | N/A | Provider/model contract is data-only; budget violations deny execution. |
| Prompt-injection-like node descriptions and external inputs are inert | deterministic | `packages/ai-core/test/safety-contract.test.mjs` | N/A - no browser/product claim | `.harness/evidence/FF-19/summary.md` | proven | N/A | Injection signals are recorded with `effect: ignored`; policy is not rewritten from text. |
| Audit trail records prompt hash, snapshot revision, commands, validation, policy, approval, execution, observation, and rollback | deterministic | `packages/ai-core/test/safety-contract.test.mjs`; existing proposal execution tests | N/A - audit surface is in-memory AI core contract | `.harness/evidence/FF-19/summary.md` | proven | N/A | Audit includes `sha256:` prompt hash, snapshot revision, validation, policy, approval, execution, observation, and rollback fields. |

## Runtime/Security Proof Status

FF-19 does not introduce a browser UI, product runtime lane, provider call, persistence engine, or deployment surface.
The security claim is deterministic contract proof: AI-visible context and proposal execution are bounded before any
provider/runtime integration. Browser/runtime proof is therefore not substituted with fixtures; it is not applicable to
this FF-19 implementation surface.

## Stop-Condition Review

No stop condition was triggered:

- Required runtime/browser proof is not missing because no runtime/browser claim is made by this implementation.
- No product/runtime code outside `.harness/goals/FF-19-contract.md` was changed.
- Policy, redaction, audit, rollback, dependency, security, and hotspot boundaries were not weakened.
- FF-20 was not started.
- No deferred proof or dated risk acceptance was used.

FF-20 may start. The only remaining full-verify failure is the exact known out-of-scope hotspot baseline recorded
before FF-19 work.
