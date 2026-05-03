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
