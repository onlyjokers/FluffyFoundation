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
