<!--
Purpose: Define the Codex-ready acceptance reconciliation contract for FF-18 AI Operator Semantic Runtime.
-->

# FF-18 Review And Acceptance Reconciliation Contract

## Objective

Determine whether FF-18 AI Operator Semantic Runtime is truly complete against `docs/harness/PLAN.md`,
`docs/harness/PLAN-zh.md`, `docs/harness/AI-OPERATOR.md`, and `docs/harness/ACCEPTANCE.md`. Either complete bounded
missing FF-18 acceptance work or produce a blocker report. Do not start FF-19.

## Scope

Allowed implementation lanes:

- `packages/ai-core/**`
- `packages/node-core/**` only for semantic command bus surfaces required by FF-18
- `docs/harness/AI-OPERATOR.md`
- `docs/harness/QUALITY-GATES.md`
- `docs/harness/BOUNDARIES.md`
- `.harness/goals/FF-18-review-contract.md` for this approved 2026-05-08 bounded product-proof lane only
- `.harness/status/current-phase.md`
- `.harness/status/current-task.md`
- `.harness/handoffs/**`
- `.harness/evidence/FF-18/**`
- FF-18-focused tests under `packages/ai-core/test/**` and `packages/node-core/test/**`
- Approved 2026-05-08 bounded product-proof lane for GS-12/GS-13 runtime proof only:
  - `apps/manager/src/routes/+page.svelte`
  - `apps/manager/src/lib/stores/group-controls.ts`
  - `apps/manager/src/lib/stores/group-controls.spec.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.ts`
  - `apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`
  - `packages/sdk-manager/src/manager-sdk.ts`
  - `packages/sdk-manager/src/manager-sdk.spec.ts`
  - `packages/sdk-manager/src/command-envelope.ts`
  - `apps/server/src/events/events.gateway.ts`
  - `apps/server/src/events/events.gateway.command-envelope.spec.ts`
  - `apps/server/src/events/events.gateway.spec.ts`
  - `apps/server/src/events/group-ownership-policy.ts`
  - `apps/server/src/events/display-routing.spec.ts`
- Approved adaptive FF-18 client e2e/runtime proof lane for GS-12 flashlight/sensors proof only:
  - `apps/client/src/routes/+page.svelte`
  - `apps/client/src/lib/stores/client/client-runtime.ts`
  - `apps/client/src/lib/stores/client/client-control.ts`
  - `apps/client/src/lib/stores/client/client-*.spec.ts`
  - `packages/sdk-client/src/node-executor.ts`
  - `packages/sdk-client/src/node-executor.spec.ts`
  - `packages/sdk-client/scripts/e2e/node-executor.offline.mjs`

Read-only context:

- `docs/harness/PLAN.md`
- `docs/harness/PLAN-zh.md`
- `docs/harness/ACCEPTANCE.md`
- Existing FF-18 evidence and handoffs
- Existing semantic command bus tests and AI Operator docs

## Non-goals

- Do not start FF-19.
- Do not add model providers, external network calls, persistence engines, or broad server endpoints.
- Do not modify Canvas/Rete/Svelte UI mutation paths.
- Do not implement direct AI mutation paths outside the semantic command bus.
- Do not treat deterministic fixtures as browser/runtime proof.
- Do not mark deferred browser/runtime work complete.
- Do not weaken production camera, flashlight, motion, microphone, permission, or capability gates to make GS-12 pass.
- Do not make e2e/dev-only proof paths reachable in production runtime.

## Acceptance criteria

FF-18 can be marked complete only if all applicable criteria are proven:

- AI semantic context excludes layout/UI noise and includes revision, nodes, connections, groups, partitions, runtime
  status, capabilities, permissions, validation reports, registry summaries, proposals, rollback references, and
  redaction metadata.
- AI proposals can represent and dry-run semantic operations through the same command bus/API used by Canvas, CLI, and
  external API paths.
- AI-visible mutations pass through policy, validation, audit, history, rollback, and redaction.
- AI can represent required FF-18 command surfaces: add/archive/restore/remove nodes, connect/disconnect, param updates,
  Group operations, partition deploy/stop, proposal approval, and rollback where supported.
- AI cannot mutate Canvas/Rete/Svelte/UI internals directly.
- Natural-language acceptance scenarios are represented: gyro rotation drives tense flashlight rhythm, display visual
  becomes breathing-like, and AI repairs param overflow or incompatible connection using structured validation errors.
- Prompt-injection-like registry/context data is handled as inert data and cannot bypass policy.
- Secret-like values and private local paths are redacted before AI-visible context.
- Remaining unsupported runtime surfaces are implemented or blocked.
- Evidence distinguishes deterministic source/test proof from browser/runtime/product proof.
- GS-12 flashlight/sensors proof may use a dev/e2e-only runtime proof lane, but the final evidence must show that the
  deployed graph reaches the client NodeExecutor command path and that production capability checks remain intact.

## Validation

Run at minimum:

```bash
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
corepack pnpm@8.15.9 --filter @shugu/node-core run build
node --test packages/ai-core/test/*.test.mjs
node --test packages/node-core/test/semantic-command-bus.test.mjs
node --test packages/node-core/test/group-ownership-policy.test.mjs
corepack pnpm@8.15.9 --filter @shugu/ai-core run lint
corepack pnpm@8.15.9 --filter @shugu/node-core run lint
corepack pnpm@8.15.9 validate:node-specs
corepack pnpm@8.15.9 verify
git diff --check
```

If `pnpm verify` fails for a pre-existing reason, record the exact failing command/output and do not mark FF-18
complete unless the failure exactly matches a baseline fingerprint allowed by the machine contract.

## Machine contract

Contract ID: `FF-18`
Completion decision: `complete | incomplete | stop`
Allowed paths: `packages/ai-core/**`, `packages/node-core/**`, `docs/harness/AI-OPERATOR.md`,
`docs/harness/QUALITY-GATES.md`, `docs/harness/BOUNDARIES.md`, `.harness/goals/FF-18-review-contract.md`,
`.harness/status/**`, `.harness/handoffs/**`, `.harness/evidence/FF-18/**`,
`apps/manager/src/routes/+page.svelte`, `apps/manager/src/lib/stores/group-controls.ts`,
`apps/manager/src/lib/stores/group-controls.spec.ts`,
`apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.ts`,
`apps/manager/src/lib/components/nodes/node-canvas/controllers/loop-helpers.spec.ts`,
`packages/sdk-manager/src/command-envelope.ts`, `packages/sdk-manager/src/manager-sdk.ts`,
`packages/sdk-manager/src/manager-sdk.spec.ts`, `apps/server/src/events/events.gateway.ts`,
`apps/server/src/events/events.gateway.command-envelope.spec.ts`, `apps/server/src/events/events.gateway.spec.ts`,
`apps/server/src/events/group-ownership-policy.ts`, `apps/server/src/events/display-routing.spec.ts`,
`apps/client/src/routes/+page.svelte`, `apps/client/src/lib/stores/client/client-runtime.ts`,
`apps/client/src/lib/stores/client/client-control.ts`, `apps/client/src/lib/stores/client/client-*.spec.ts`,
`packages/sdk-client/src/node-executor.ts`, `packages/sdk-client/src/node-executor.spec.ts`,
`packages/sdk-client/scripts/e2e/node-executor.offline.mjs`
Forbidden paths: `apps/manager/src/lib/components/nodes/**` outside the approved loop-helper files above,
`apps/client/**` outside the approved adaptive client e2e/runtime proof files above, `apps/display/**`,
`apps/server/**` outside the approved 2026-05-08 bounded product-proof files above
Required proof types: `implementation`, `deterministic`, `runtime-browser`
Runtime/browser proof: `required-for-runtime-claims`
Deferred proof policy: `reject-by-default`
Risk severity policy: `blocking/high/release-blocking stop; medium requires contract allowlist; low requires complete dated record`
Failure fingerprint policy: `exact-baseline-required`
Next item start policy: `forbidden-until-complete`
Automated validation command: `python3 .harness/scripts/validate_acceptance_contracts.py && pnpm verify && git diff --check`
Adaptive execution policy: `allowed-for-FF-18-only; may update this contract/evidence/status/handoff plus allowed implementation lanes in one goal run; must stop on security/policy/audit/rollback/redaction/hotspot weakening, production permission bypass, FF-19 scope, or missing runtime-browser proof`

## Stop conditions

Stop and report if:

- FF-18 requires product/browser/runtime integration beyond the allowed scope.
- The product-proof lane expands beyond Manager published Group control, SDK command envelope scope preservation, server
  scoped-command policy tests, runtime evidence, or evidence/status/handoff updates.
- The adaptive client proof lane expands beyond dev/e2e GS-12 proof, client NodeExecutor status/command-path
  visibility, or tests that prove production permission gates remain intact.
- A required semantic command surface belongs to FF-19 or later.
- Passing requires weakening policy, validation, audit, rollback, redaction, dependency boundaries, or hotspot ratchets.
- Passing requires weakening production camera, flashlight, motion, microphone, permission, or capability gates.
- Browser/runtime proof is replaced by deterministic e2e fixtures instead of live Manager/Client/Server interaction.
- Evidence shows FF-18 was marked complete only by status-transition files.
- `pnpm verify` fails for a reason that does not exactly match an approved baseline failure fingerprint.

## Final report

Report:

- FF-18 status: `complete`, `incomplete`, or `complete-with-dated-risk-acceptance`.
- Files changed.
- Commands run and results.
- Proof matrix using `docs/harness/ACCEPTANCE.md`.
- Evidence paths updated.
- Which criteria are deterministic-only, runtime/browser-proven, deferred, or blocked.
- Whether FF-19 may safely start.
