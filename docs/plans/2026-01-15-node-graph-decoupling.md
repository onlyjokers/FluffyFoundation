# Node Graph Decoupling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gradually decouple Node Graph across manager/client/display without changing any user-visible behavior.

**Architecture:** Expand `packages/node-core` into a pure graph-state + runtime contract layer. Manager/UI becomes a thin adapter producing graph actions; client/display become runtime adapters consuming graph changes. Transport is isolated per app.

**Tech Stack:** Svelte/SvelteKit, TypeScript, Node test runner (`node --test`), pnpm.

---

### Task 1: Add graph change model to node-core (pure, data-only)

**Files:**
- Create: `packages/node-core/src/graph-state/changes.ts`
- Modify: `packages/node-core/src/index.ts`
- Test: `packages/node-core/test/graph-changes.test.mjs`

**Step 1: Write failing test for change application**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphChanges } from '../dist-node-core/graph-state/changes.js';

const base = { nodes: [], connections: [] };

test('applyGraphChanges adds and removes nodes + connections', () => {
  const next = applyGraphChanges(base, [
    { type: 'add-node', node: { id: 'n1', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} } },
    { type: 'add-node', node: { id: 'n2', type: 'number', position: { x: 1, y: 1 }, config: {}, inputValues: {}, outputValues: {} } },
    { type: 'add-connection', connection: { id: 'c1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in' } },
    { type: 'remove-connection', connectionId: 'c1' },
    { type: 'remove-node', nodeId: 'n2' }
  ]);

  assert.equal(next.nodes.length, 1);
  assert.equal(next.connections.length, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @shugu/node-core test -- --test-name-pattern graph-changes`
Expected: FAIL (module not found / function missing)

**Step 3: Implement minimal change model**

```ts
export type GraphChange =
  | { type: 'add-node'; node: NodeInstance }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'update-node-position'; nodeId: string; position: { x: number; y: number } }
  | { type: 'update-node-config'; nodeId: string; config: Record<string, unknown> }
  | { type: 'add-connection'; connection: Connection }
  | { type: 'remove-connection'; connectionId: string };

export function applyGraphChanges(state: GraphState, changes: GraphChange[]): GraphState {
  // return new arrays, never mutate input
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @shugu/node-core test -- --test-name-pattern graph-changes`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/node-core/src/graph-state/changes.ts packages/node-core/src/index.ts packages/node-core/test/graph-changes.test.mjs
git commit -m "feat(node-core): add graph change model"
```

---

### Task 2: Add graph validation utilities (pure)

**Files:**
- Create: `packages/node-core/src/graph-state/validate.ts`
- Modify: `packages/node-core/src/index.ts`
- Test: `packages/node-core/test/graph-validate.test.mjs`

**Step 1: Write failing test for validation**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraphState } from '../dist-node-core/graph-state/validate.js';

test('validateGraphState flags missing node refs', () => {
  const state = {
    nodes: [{ id: 'n1', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} }],
    connections: [{ id: 'c1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'missing', targetPortId: 'in' }]
  };
  const result = validateGraphState(state);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length > 0, true);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @shugu/node-core test -- --test-name-pattern graph-validate`
Expected: FAIL

**Step 3: Implement minimal validator**

```ts
export type GraphValidationResult = { ok: boolean; errors: string[] };
export function validateGraphState(state: GraphState): GraphValidationResult {
  // check duplicate ids, missing node refs in connections
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @shugu/node-core test -- --test-name-pattern graph-validate`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/node-core/src/graph-state/validate.ts packages/node-core/src/index.ts packages/node-core/test/graph-validate.test.mjs
git commit -m "feat(node-core): add graph validation utilities"
```

---

### Task 3: Unify GraphState imports in manager

**Files:**
- Modify: `apps/manager/src/lib/nodes/types.ts`
- Modify: `apps/manager/src/lib/nodes/engine.ts`
- Modify: `apps/manager/src/lib/components/nodes/**` (imports only)

**Step 1: Make manager graph types re-export node-core**

```ts
export type { GraphState, NodeInstance, Connection, NodePort, PortType } from '@shugu/node-core';
```

**Step 2: Replace local imports with node-core re-exports**

- Update `import type { GraphState ... }` lines to use `$lib/nodes/types` (which now proxies node-core)

**Step 3: Lint manager**

Run: `pnpm exec eslint --format unix apps/manager/src`
Expected: no warnings

**Step 4: Commit**

```bash
git add apps/manager/src/lib/nodes/types.ts apps/manager/src/lib/nodes/engine.ts apps/manager/src/lib/components/nodes
git commit -m "refactor(manager): unify graph types via node-core"
```

---

### Task 4: Manager engine emits change sets

**Files:**
- Modify: `apps/manager/src/lib/nodes/engine.ts`
- Create: `apps/manager/src/lib/nodes/graph-changes.ts`
- Test: `apps/manager/src/lib/nodes/graph-changes.spec.ts`

**Step 1: Write failing test for change emission**

```ts
import { describe, it, expect } from 'vitest';
import { applyEngineAction } from './graph-changes';

it('emits add-node change on create', () => {
  const { changes } = applyEngineAction({ type: 'add-node', nodeId: 'n1' }, { nodes: [], connections: [] });
  expect(changes[0].type).toBe('add-node');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest apps/manager/src/lib/nodes/graph-changes.spec.ts`
Expected: FAIL

**Step 3: Implement minimal action->change mapping**

```ts
export function applyEngineAction(action: EngineAction, state: GraphState): { next: GraphState; changes: GraphChange[] } {
  // use node-core applyGraphChanges
}
```

**Step 4: Wire engine to use change mapping**

- Replace direct mutations in `engine.ts` with `applyEngineAction` + `applyGraphChanges`.

**Step 5: Run test and lint**

Run:
- `pnpm exec vitest apps/manager/src/lib/nodes/graph-changes.spec.ts`
- `pnpm exec eslint --format unix apps/manager/src/lib/nodes/engine.ts`

**Step 6: Commit**

```bash
git add apps/manager/src/lib/nodes/engine.ts apps/manager/src/lib/nodes/graph-changes.ts apps/manager/src/lib/nodes/graph-changes.spec.ts
git commit -m "refactor(manager): emit graph change sets"
```

---

### Task 5: Client runtime adapter consumes change sets

**Files:**
- Modify: `apps/client/src/lib/stores/client/client-control.ts`
- Modify: `apps/client/src/lib/stores/client/client-runtime.ts`
- Create: `apps/client/src/lib/stores/client/graph-change-consumer.ts`

**Step 1: Add a change consumer helper**

```ts
export function applyGraphChangesToRuntime(changes: GraphChange[], runtime: NodeExecutor): void {
  // translate change list into runtime operations
}
```

**Step 2: Wire client control to call change consumer**

- Replace any direct graph mutation calls with change sets.

**Step 3: Lint client**

Run: `pnpm exec eslint --format unix apps/client/src`
Expected: no warnings

**Step 4: Commit**

```bash
git add apps/client/src/lib/stores/client/client-control.ts apps/client/src/lib/stores/client/client-runtime.ts apps/client/src/lib/stores/client/graph-change-consumer.ts
git commit -m "refactor(client): consume graph change sets"
```

---

### Task 6: Display runtime adapter consumes change sets

**Files:**
- Modify: `apps/display/src/lib/stores/display.ts`
- Create: `apps/display/src/lib/stores/graph-change-consumer.ts`

**Step 1: Add change consumer helper**

```ts
export function applyGraphChangesToDisplay(changes: GraphChange[], executor: NodeExecutor): void {
  // align with client behavior
}
```

**Step 2: Wire display transport to change consumer**

**Step 3: Lint display**

Run: `pnpm exec eslint --format unix apps/display/src`
Expected: no warnings

**Step 4: Commit**

```bash
git add apps/display/src/lib/stores/display.ts apps/display/src/lib/stores/graph-change-consumer.ts
git commit -m "refactor(display): consume graph change sets"
```

---

### Task 7: Transport alignment (protocol)

**Files:**
- Modify: `packages/protocol/src/types.ts`
- Modify: `packages/protocol/src/helpers.ts`
- Modify: `packages/sdk-client/src/node-types.ts`

**Step 1: Add GraphChange payload schema**

```ts
export type GraphChangeMessage = {
  type: 'graph-changes';
  changes: GraphChange[];
};
```

**Step 2: Update helpers + SDK types**

**Step 3: Lint protocol + sdk-client**

Run:
- `pnpm --filter @shugu/protocol lint`
- `pnpm --filter @shugu/sdk-client lint`

**Step 4: Commit**

```bash
git add packages/protocol/src/types.ts packages/protocol/src/helpers.ts packages/sdk-client/src/node-types.ts
git commit -m "feat(protocol): add graph change message"
```

---

### Task 8: Regression + Gate

**Step 1: Lint**

Run: `pnpm lint`
Expected: 0 warnings

**Step 2: Node-core tests**

Run: `pnpm --filter @shugu/node-core test`
Expected: PASS

**Step 3: Manual regression (Phase 1 playbook)**

Follow: `docs/PlanDocs/0109_RootManagerControlPlane/phase1_regression_playbook.md`
Record results in: `docs/PlanDocs/0109_RootManagerControlPlane/plan_progress.md`

**Step 4: Commit**

```bash
git add docs/PlanDocs/0109_RootManagerControlPlane/plan_progress.md
git commit -m "test: node graph regression pass"
```

---

Plan complete and saved to `docs/plans/2026-01-15-node-graph-decoupling.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
