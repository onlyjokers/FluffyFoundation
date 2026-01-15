# Node Graph Architecture Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Node Graph "boulder" files while keeping runtime behavior identical.

**Architecture:** Extract pure helpers into test-covered modules and wire them from the composition root (NodeCanvas). Keep UI behavior stable by isolating data/logic boundaries and preserving the existing adapter/controller flow.

**Tech Stack:** SvelteKit, TypeScript, Rete.js, Node.js test runner + tsx.

### Task 1: Enable TS test runner for Node Graph helpers

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Write the failing test**

Create `apps/manager/src/lib/components/nodes/node-canvas/groups/normalize-group-list.spec.ts` that imports `normalizeGroupList` from a new module and asserts its behavior (see Task 2). Do **not** create the module yet.

**Step 2: Run test to verify it fails**

Run: `pnpm dlx tsx --test "apps/manager/src/lib/components/nodes/node-canvas/groups/**/*.spec.ts"`

Expected: FAIL due to missing module (import error).

**Step 3: Install test runner**

Add dev dependency:

```bash
pnpm add -D tsx
```

Add script to `package.json`:

```json
"test:node-canvas": "pnpm tsx --test \"apps/manager/src/lib/components/nodes/node-canvas/groups/**/*.spec.ts\""
```

**Step 4: Re-run test to verify it still fails**

Run: `pnpm test:node-canvas`

Expected: FAIL (still missing module).

**Step 5: Commit**

Skip (user requested manual commits).

### Task 2: Extract normalizeGroupList into a tested helper

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/groups/normalize-group-list.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`
- Test: `apps/manager/src/lib/components/nodes/node-canvas/groups/normalize-group-list.spec.ts`

**Step 1: Write the failing test**

Implement tests that capture existing behavior:
- preserves first-seen order of group IDs
- dedupes nodeIds and coerces to string
- merges duplicate group entries, preferring runtimeActive when first set

**Step 2: Run test to verify it fails**

Run: `pnpm test:node-canvas`

Expected: FAIL due to missing module/behavior.

**Step 3: Write minimal implementation**

Create `normalize-group-list.ts` with the extracted logic from `group-controller.ts`.

**Step 4: Run tests to verify they pass**

Run: `pnpm test:node-canvas`

Expected: PASS.

**Step 5: Refactor group-controller**

Replace the inline `normalizeGroupList` with the imported helper.

**Step 6: Run tests to ensure still green**

Run: `pnpm test:node-canvas`

Expected: PASS.

**Step 7: Commit**

Skip (user requested manual commits).

### Task 3: Extract group node-type helpers

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/groups/group-node-types.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`
- Test: `apps/manager/src/lib/components/nodes/node-canvas/groups/group-node-types.spec.ts`

**Step 1: Write the failing test**

Create tests for:
- `isGroupDecorationNodeType` returns true for `group-frame` and group-port node types
- returns false for other types

**Step 2: Run test to verify it fails**

Run: `pnpm test:node-canvas`

Expected: FAIL.

**Step 3: Write minimal implementation**

Create `group-node-types.ts` and export `GROUP_FRAME_NODE_TYPE`, `isGroupDecorationNodeType`.

**Step 4: Run tests to verify they pass**

Run: `pnpm test:node-canvas`

Expected: PASS.

**Step 5: Refactor group-controller to use new helper**

Import and replace inline constants.

**Step 6: Run tests to ensure still green**

Run: `pnpm test:node-canvas`

Expected: PASS.

**Step 7: Commit**

Skip (user requested manual commits).

### Task 4: Re-run baseline checks

**Files:**
- None

**Step 1: Lint**

Run: `pnpm lint`

Expected: 0 errors.

**Step 2: Commit**

Skip (user requested manual commits).
