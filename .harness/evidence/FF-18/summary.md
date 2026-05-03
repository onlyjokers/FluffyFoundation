<!--
Purpose: Record FF-18 evidence for AI Operator Semantic Runtime work packets.
-->

# FF-18 Evidence Summary

## WP1 - AI Semantic Context And Dry-Run Proposal Core

Implemented:
- AI-readable semantic context packaging in `@shugu/ai-core` that keeps revision, nodes, connections, groups, partitions, runtime status, device capabilities, permissions, compact registry summaries, proposals, policy, validation reports, dry-run summaries, rollback references, and redaction metadata.
- Context redaction for secret-like keys and private local paths, plus exclusion of UI/layout noise such as positions, selection, collapse state, colors, viewport zoom/pan, and panel layout fields.
- Deterministic proposal planner core that drafts constrained `display-breathing` and `gyro-flashlight-rhythm` semantic command proposals and dry-runs the sequence through an injected semantic command bus without applying live mutations.
- Structured semantic command dry-run validation errors for param overflow and incompatible ports, including code, path, severity, message, machine reason, and repair options.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/*.test.mjs
PASS: 4 tests, 0 failures

corepack pnpm@8.15.9 --filter @shugu/node-core run build
PASS

node --test packages/node-core/test/semantic-command-bus.test.mjs
PASS: 6 tests, 0 failures

corepack pnpm@8.15.9 validate:node-specs
PASS: 49 files, 26 existing runtime-ignored warnings, 0 errors
```

Deterministic context/proposal fixture output:

```json
{
  "redactions": 6,
  "nodeKeys": ["id", "type", "params", "inputValues", "outputValues"],
  "managerKey": "[REDACTED:secret]",
  "localPath": "[REDACTED:private-path]",
  "proposalStatus": "dry-run-failed",
  "commandCount": 1,
  "validationCode": "GRAPH.PARAM_OUT_OF_RANGE",
  "rollbackReference": null
}
```

Verification notes:
- Browser/runtime proof is intentionally not included for WP1 because live execution, UI, display/client observation, and server runtime wiring are deferred by task scope.
- The planner remains dependency-free and uses an injected semantic command bus shape, so WP1 does not add a new package dependency or provider/persistence mechanism.

## WP2 - AI Proposal Approval And Transactional Execution Core

Implemented:
- `@shugu/ai-core` now exposes `createAiProposalExecutionCore`, a bounded in-memory proposal executor that accepts an injected semantic command bus and does not add provider calls, persistence, server endpoints, UI wiring, or Display/Client observation.
- Local policy evaluation covers allowed, approval-required, and denied operations. Approval-required proposals still dry-run through the semantic command bus and stop before apply until an approval token is supplied.
- Allowed or approved proposal commands apply through the existing semantic command bus, preserving command-bus validation, policy, audit, history, revision, and rollback-token behavior.
- Execution results include command sequence, dry-run stage, applied revision, audit lifecycle, history entry, AI rollback reference, command rollback token list, and rollback recovery metadata.
- Rollback maps the AI rollback reference to the command-bus rollback token and restores the previous semantic state.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/*.test.mjs
PASS: 8 tests, 0 failures

corepack pnpm@8.15.9 --filter @shugu/node-core run build
PASS

node --test packages/node-core/test/semantic-command-bus.test.mjs packages/node-core/test/group-ownership-policy.test.mjs
PASS: 11 tests, 0 failures

corepack pnpm@8.15.9 --filter @shugu/ai-core run lint
PASS

corepack pnpm@8.15.9 --filter @shugu/node-core run lint
PASS

git diff --check
PASS

corepack pnpm@8.15.9 lint
PASS with existing warnings outside WP2:
- packages/multimedia-core/src/multimedia-core.ts unused reason warning
- packages/sdk-client/src/tone-adapter/types.ts no-explicit-any warnings

corepack pnpm@8.15.9 build:all
PASS with existing SvelteKit/Svelte/Rete/Sass build warnings outside WP2
```

Deterministic execution fixture output:

```json
{
  "approved": {
    "status": "applied",
    "policy": "allowed",
    "dryRunOk": true,
    "dryRunCount": 1,
    "appliedCount": 1,
    "previousRevision": 12,
    "appliedRevision": 13,
    "historyEntries": 1,
    "rollbackReference": "ai-rollback:proposal:breath:rollback:12:2",
    "intensity": 0.72,
    "rollbackIntensity": 0.35
  },
  "denied": {
    "status": "policy-denied",
    "policy": "denied",
    "dryRunOk": false,
    "dryRunCount": 0,
    "appliedCount": 0,
    "previousRevision": 12,
    "appliedRevision": null,
    "historyEntries": 0,
    "rollbackReference": null,
    "intensity": 0.35,
    "rollbackIntensity": null
  },
  "rollback": {
    "status": "applied",
    "policy": "allowed",
    "dryRunOk": true,
    "dryRunCount": 1,
    "appliedCount": 1,
    "previousRevision": 12,
    "appliedRevision": 13,
    "historyEntries": 1,
    "rollbackReference": "ai-rollback:proposal:breath:rollback:12:2",
    "intensity": 0.72,
    "rollbackIntensity": 0.35
  }
}
```

Verification notes:
- Browser/runtime proof is intentionally not included for WP2 because server/UI/display observation remains deferred by task scope.
- Direct UI mutation paths were not introduced; `rg -n "Canvas|Rete|Svelte|svelte|apps/manager|node-canvas|document\.|window\." packages/ai-core/src packages/ai-core/test` only found the existing semantic-context purpose header reference to excluding Canvas/UI layout noise.
- `.harness/evidence/FF-18/summary.md` is ignored by current gitignore policy; Review must force-add it if the evidence file should be included in the final commit.

## WP3 - AI Structured Observation And Repair Planning Core

Implemented:
- `@shugu/ai-core` exposes `createAiObservationEvaluator` and `createAiRepairPlanner` as the bounded in-memory WP3 observation and repair API. This public export is documented in `docs/harness/AI-OPERATOR.md` and remains limited to the WP3 contract.
- Structured observation report types cover output change, validation errors, device capability gaps, no output change, rollback-needed states, and policy denial.
- The evaluator consumes WP2 proposal execution results plus structured observation reports, classifies success, validation failure, missing device capability, no visible output change, rollback-needed, and policy-denied outcomes, and maps rollback recommendations to WP2 rollback metadata.
- The repair planner uses structured validation codes, paths, registry summaries, and repair hints to draft bounded semantic command proposals for param overflow and incompatible connections. It does not parse arbitrary console text.
- Observation and repair results reuse AI context redaction so secret-like values and private local paths in structured observation fields are stripped before evaluator/planner output.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/observation-repair.test.mjs
PASS: 10 tests, 0 failures
```

Deterministic observation/repair fixture output:

```json
{
  "success": {
    "classification": "success",
    "rollbackRecommended": false,
    "evidenceKind": "output-change"
  },
  "noOutputChange": {
    "classification": "no-output-change",
    "rollbackRecommended": true,
    "rollbackReference": "ai-rollback:proposal:wp3:rollback:12:2",
    "previousRevision": 12,
    "appliedRevision": 13
  },
  "validationRepair": {
    "classification": "validation-failure",
    "repairable": true,
    "sourceError": "GRAPH.PARAM_OUT_OF_RANGE",
    "repairType": "proposal",
    "commands": [
      {
        "type": "node.params.update",
        "nodeId": "display:breath",
        "params": {
          "intensity": 1
        }
      }
    ],
    "sourceErrorCodes": [
      "GRAPH.PARAM_OUT_OF_RANGE"
    ]
  }
}
```

Verification notes:
- Browser/runtime proof remains intentionally deferred for WP3 because live server/UI/display observation is outside this slice.
- Direct UI mutation paths were not introduced; `rg -n "Canvas|Rete|Svelte|svelte|apps/manager|node-canvas|document\.|window\." packages/ai-core/src packages/ai-core/test` only found the existing semantic-context purpose header reference to excluding Canvas/UI layout noise.
- `.harness/evidence/FF-18/summary.md` is ignored by current gitignore policy; Review must force-add it if the evidence file should be included in the final commit.

## WP4 - AI Golden Scenario Contract Fixtures

Implemented:
- `@shugu/ai-core` now exposes `runFf18GoldenScenarioFixtures`, a deterministic executable contract fixture runner for FF-18 GS-12, GS-13, and GS-14.
- The fixture runner composes the existing WP1 semantic context/planner, WP2 proposal execution/rollback core, and WP3 observation/repair planner. It does not add providers, persistence, server endpoints, browser routes, protocol-breaking types, or live runtime wiring.
- GS-12 proves gyro rotation context drives a tense flashlight rhythm via semantic `node.params.update` graph commands, command-bus dry-run/apply metadata, structured output-change observation, rollback metadata, risk, policy, and redaction summary.
- GS-13 proves display breathing applies bounded display params and records a structured output-change observation.
- GS-14 proves a structured `GRAPH.PARAM_OUT_OF_RANGE` validation error emits a bounded repair proposal that clamps overflow without parsing arbitrary console text.
- Context redaction was narrowed so registry param schema fields named `key` remain usable for repair planning while secret-bearing names like `managerKey`, `apiKey`, `accessKey`, and `privateKey` are still redacted.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/golden-scenario-contract.test.mjs packages/ai-core/test/semantic-context.test.mjs
PASS: 7 tests, 0 failures
```

Deterministic golden scenario fixture output:

```json
[
  {
    "scenarioId": "GS-12",
    "commandSequence": [
      { "type": "node.params.update", "nodeId": "flashlight:rhythm", "params": { "rhythmHz": 9, "tension": 0.86 } }
    ],
    "expectedOutputChange": {
      "summary": "Gyro input maps to a bounded tense flashlight rhythm parameter change.",
      "targetNodeId": "flashlight:rhythm",
      "params": { "rhythmHz": 9, "tension": 0.86 }
    },
    "risk": { "level": "high" },
    "policy": { "dryRun": "proposal-only", "apply": "allowed" },
    "status": { "dryRun": "dry-run-passed", "apply": "applied" },
    "audit": {
      "rollbackReference": "ai-rollback:proposal:gs12-gyro-flashlight:rollback:30:3",
      "historyStatus": "applied"
    },
    "observedResult": { "classification": "success", "evidenceKind": "output-change" },
    "redactions": 4
  },
  {
    "scenarioId": "GS-13",
    "commandSequence": [
      { "type": "node.params.update", "nodeId": "display:breath", "params": { "intensity": 0.68, "breathRate": 0.42 } }
    ],
    "expectedOutputChange": {
      "summary": "Display breathing intensity changes within bounded visual parameters.",
      "targetNodeId": "display:breath",
      "params": { "intensity": 0.68, "breathRate": 0.42 }
    },
    "risk": { "level": "medium" },
    "policy": { "dryRun": "proposal-only", "apply": "allowed" },
    "status": { "dryRun": "dry-run-passed", "apply": "applied" },
    "audit": {
      "rollbackReference": "ai-rollback:proposal:gs13-display-breathing:rollback:40:3",
      "historyStatus": "applied"
    },
    "observedResult": { "classification": "success", "changedTargets": ["display:breath"] },
    "redactions": 3
  },
  {
    "scenarioId": "GS-14",
    "commandSequence": [
      { "type": "node.params.update", "nodeId": "display:overflow", "params": { "intensity": 1.8, "breathRate": 0.5 } }
    ],
    "expectedOutputChange": {
      "summary": "Display breathing intensity changes within bounded visual parameters.",
      "targetNodeId": "display:overflow",
      "params": { "intensity": 1.8, "breathRate": 0.5 }
    },
    "risk": { "level": "medium" },
    "policy": { "dryRun": "proposal-only", "apply": "allowed" },
    "status": { "dryRun": "dry-run-failed", "apply": "dry-run-failed" },
    "audit": { "rollbackReference": null, "historyStatus": null },
    "observedResult": { "classification": "validation-failure", "sourceError": "GRAPH.PARAM_OUT_OF_RANGE" },
    "repair": {
      "type": "proposal",
      "commands": [
        { "type": "node.params.update", "nodeId": "display:overflow", "params": { "intensity": 1 } }
      ],
      "sourceErrorCodes": ["GRAPH.PARAM_OUT_OF_RANGE"]
    },
    "redactions": 3
  }
]
```

Verification notes:
- Browser/runtime proof remains intentionally deferred for WP4 because Plan scoped this slice to executable contract/scenario proof only.
- Direct UI mutation paths were not introduced; `rg -n "Canvas|Rete|Svelte|svelte|apps/manager|node-canvas|document\.|window\." packages/ai-core/src packages/ai-core/test` only found the existing semantic-context purpose header reference to excluding Canvas/UI layout noise.
- `.harness/evidence/FF-18/summary.md` is ignored by current gitignore policy; Review must force-add it if the evidence file should be included in the final commit.

## WP5 - AI Semantic Command Bus Parity Adapter

Implemented:
- `@shugu/ai-core` now exposes `runAiSemanticCommandBusParityFixture`, a deterministic parity fixture that accepts real semantic command bus instances from `@shugu/node-core`.
- The fixture runs equivalent AI proposal execution and direct non-AI command-bus dispatch for the command surfaces touched so far: `node.add`, `node.archive`, `node.params.update`, `node.connect`, and `node.disconnect`.
- AI execution still flows through WP1 raw-command proposal/dry-run, WP2 proposal execution/audit/history/rollback metadata, and WP3 structured output-change observation.
- AI-visible parity traces retain semantic context/redaction metadata, command sequence, dry-run/apply policy, execution audit, rollback reference, history entry, observed result, direct caller result, and normalized snapshot parity flags.
- `AiSemanticCommand` now includes `node.add` and `node.archive` so AI raw-command proposals can represent the same semantic command bus surfaces as Canvas/CLI/API without adding a direct UI mutation path.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/*.test.mjs
PASS: 22 tests, 0 failures
```

Deterministic parity fixture output:

```json
[
  {
    "caseId": "add",
    "commandType": "node.add",
    "aiStatus": { "dryRun": "dry-run-passed", "apply": "applied" },
    "directOk": true,
    "parity": { "appliedRevisionMatches": true, "snapshotMatches": true, "commandTypeMatches": true },
    "rollbackReference": "ai-rollback:proposal:wp5:add:rollback:80:3",
    "historyStatus": "applied",
    "observed": "success",
    "redactions": 2
  },
  {
    "caseId": "archive",
    "commandType": "node.archive",
    "aiStatus": { "dryRun": "dry-run-passed", "apply": "applied" },
    "directOk": true,
    "parity": { "appliedRevisionMatches": true, "snapshotMatches": true, "commandTypeMatches": true },
    "rollbackReference": "ai-rollback:proposal:wp5:archive:rollback:90:3",
    "historyStatus": "applied",
    "observed": "success",
    "redactions": 2
  },
  {
    "caseId": "params",
    "commandType": "node.params.update",
    "aiStatus": { "dryRun": "dry-run-passed", "apply": "applied" },
    "directOk": true,
    "parity": { "appliedRevisionMatches": true, "snapshotMatches": true, "commandTypeMatches": true },
    "rollbackReference": "ai-rollback:proposal:wp5:params:rollback:100:3",
    "historyStatus": "applied",
    "observed": "success",
    "redactions": 2
  },
  {
    "caseId": "connect",
    "commandType": "node.connect",
    "aiStatus": { "dryRun": "dry-run-passed", "apply": "applied" },
    "directOk": true,
    "parity": { "appliedRevisionMatches": true, "snapshotMatches": true, "commandTypeMatches": true },
    "rollbackReference": "ai-rollback:proposal:wp5:connect:rollback:110:3",
    "historyStatus": "applied",
    "observed": "success",
    "redactions": 2
  },
  {
    "caseId": "disconnect",
    "commandType": "node.disconnect",
    "aiStatus": { "dryRun": "dry-run-passed", "apply": "applied" },
    "directOk": true,
    "parity": { "appliedRevisionMatches": true, "snapshotMatches": true, "commandTypeMatches": true },
    "rollbackReference": "ai-rollback:proposal:wp5:disconnect:rollback:120:3",
    "historyStatus": "applied",
    "observed": "success",
    "redactions": 2
  }
]
```

Verification notes:
- Browser/runtime proof remains intentionally deferred for WP5 because Plan scoped this packet to deterministic source/tests only.
- Direct UI mutation paths were not introduced; `rg -n "Canvas|Rete|Svelte|svelte|apps/manager|node-canvas|document\.|window\." packages/ai-core/src packages/ai-core/test` only found the existing semantic-context purpose header reference to excluding Canvas/UI layout noise.
- `.harness/evidence/FF-18/summary.md` is ignored by current gitignore policy; Review must force-add it if the evidence file should be included in the final commit.

## WP6 - AI Operator Safety Acceptance Traces

Implemented:
- `@shugu/ai-core` now exposes `runAiOperatorAcceptanceFixtures`, a deterministic acceptance fixture runner for missing device capability, policy denial/proposal stop, and prompt-injection-resistant registry/context handling.
- The fixture composes the existing FF-18 semantic context, deterministic planner, proposal execution, observation evaluator, golden scenario, and command-bus parity cores. It remains dependency-free and does not add provider calls, persistence, server endpoints, browser runtime wiring, or UI mutation paths.
- Missing device capability is represented as a structured `device-capability-gap` observation and emits a bounded fallback proposal for display/screen pulse behavior.
- Policy-denied destructive mutation is stopped before dry-run/apply and converted into a human approval proposal while preserving non-execution evidence.
- Prompt-injection-like registry text remains AI-visible as inert data, while secret/private-path fields are redacted and cannot bypass semantic command bus policy.
- `AiSemanticCommand` now includes `node.remove` only so denied destructive proposals can be represented and proven non-executing by the AI Operator acceptance trace.

Focused proof:

```text
corepack pnpm@8.15.9 --filter @shugu/ai-core run build
PASS

node --test packages/ai-core/test/operator-acceptance.test.mjs
PASS: 1 test, 0 failures
```

Deterministic acceptance trace output:

```json
[
  {
    "scenarioId": "capability-gap",
    "executionStatus": "applied",
    "evaluation": "device-capability-gap",
    "fallback": {
      "type": "proposal",
      "reasonCode": "DEVICE.CAPABILITY_GAP",
      "source": "capability-gap",
      "proposal": {
        "id": "proposal:wp6-capability-gap:fallback",
        "status": "draft",
        "commands": [
          { "type": "node.params.update", "nodeId": "flash:1", "params": { "mode": "screen-pulse", "rhythmHz": 4 } }
        ]
      }
    },
    "nonExecution": { "beforeRevision": 200, "afterRevision": 201, "appliedMutation": true },
    "redactions": 3
  },
  {
    "scenarioId": "policy-denial",
    "executionStatus": "policy-denied",
    "evaluation": "policy-denied",
    "fallback": {
      "type": "proposal",
      "reasonCode": "POLICY.APPROVAL_REQUIRED",
      "source": "policy-denial",
      "proposal": {
        "id": "proposal:wp6-policy-denied",
        "status": "proposed",
        "commands": [{ "type": "node.remove", "nodeId": "display:1" }]
      }
    },
    "nonExecution": {
      "beforeRevision": 300,
      "afterRevision": 300,
      "beforeNodeCount": 1,
      "afterNodeCount": 1,
      "appliedMutation": false
    },
    "redactions": 2
  },
  {
    "scenarioId": "prompt-injection-registry",
    "executionStatus": "policy-denied",
    "evaluation": "policy-denied",
    "fallback": {
      "type": "unavailable",
      "reasonCode": "POLICY.PROMPT_INJECTION_DATA_ONLY",
      "source": "prompt-injection"
    },
    "injection": { "handledAsData": true, "deniedOperation": "node.remove" },
    "nonExecution": {
      "beforeRevision": 400,
      "afterRevision": 400,
      "beforeNodeCount": 1,
      "afterNodeCount": 1,
      "appliedMutation": false
    },
    "redactions": 2
  }
]
```

Verification notes:
- Browser/runtime proof remains intentionally deferred for WP6 because Plan scoped this packet to deterministic source/tests only.
- Direct UI mutation paths were not introduced; `rg -n "Canvas|Rete|Svelte|svelte|apps/manager|node-canvas|document\.|window\." packages/ai-core/src packages/ai-core/test` only found the existing semantic-context purpose header reference to excluding Canvas/UI layout noise.
- `.harness/evidence/FF-18/summary.md` is ignored by current gitignore policy; Review must force-add it if the evidence file should be included in the final commit.
