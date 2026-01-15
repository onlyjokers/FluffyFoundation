# Repo Hygiene + Node Graph Stabilization Design

**Goal:** Reduce "boulder" files and lint warnings across the repo while preserving all user-visible behavior.

**Constraints:**
- Zero UX changes; behavior must remain unchanged.
- Refactors are modular, test-backed (TDD) for any logic changes.
- Follow existing manager/client/server data flow conventions.

## Design Principles
- **Composition root stays thin:** `NodeCanvas.svelte` and other top-level components only wire dependencies.
- **Behavioral parity:** Extract pure helpers and keep UI rendering identical.
- **Explicit module boundaries:** UI vs controllers vs runtime vs adapters, matching existing architecture docs.
- **Incremental batching:** Fix warnings and boulders in small, verifiable steps.

## External Reference Alignment
- Rete.js emphasizes modular plugin composition and scoped/nested structures; we mirror this by isolating group/scope logic into testable helpers and leaving plugin wiring in the composition root. ([Rete plugin system](https://retejs.org/docs/concepts/plugin-system/))
- Rete scopes and subgraph behaviors reinforce clear parent/child boundaries for nested nodes, aligning with our group/expanded custom node partitioning. ([Rete scopes API](https://retejs.org/docs/api/rete-scopes-plugin))
- Node-RED defines subflows as a collection of nodes collapsed into a reusable node instance, which supports our separation between group definitions and runtime instances. ([Node-RED subflows](https://nodered.org/docs/user-guide/editor/workspace/subflows))

## Execution Strategy
1. **Lint inventory:** generate an authoritative warning list and fix in batches.
2. **Boulder extraction:** prioritize the largest runtime/graph files and extract pure helpers.
3. **Regression guard:** run `pnpm lint` + targeted tests after each batch.

## Expected Outcome
- Lint warnings reduced to zero without behavior changes.
- Node Graph architecture stabilized into smaller modules that resist re-bloating.
