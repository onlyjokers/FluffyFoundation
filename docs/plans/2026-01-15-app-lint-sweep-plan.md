# Manager/Client/Display Lint Sweep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate remaining lint warnings in apps/manager, apps/client, and apps/display without changing UX.

**Architecture:** Add shared `unknown`-to-typed guard helpers and apply them consistently across node-graph and store modules. Avoid runtime behavior changes by keeping guards permissive and defaulting to existing values.

**Tech Stack:** TypeScript, SvelteKit, Node test runner (`tsx`), ESLint.

### Task 1: Add shared manager guard helpers (foundation)

**Files:**
- Create: `apps/manager/src/lib/utils/value-guards.ts`
- Create: `apps/manager/src/lib/utils/value-guards.spec.ts`

**Step 1: Write the failing test**

Add tests covering:
- `asRecord()` returns empty record for invalid inputs
- `getString()` returns default on invalid
- `getNumber()` returns default on invalid
- `getBoolean()` returns default on invalid

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/manager/src/lib/utils/value-guards.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Implement `value-guards.ts` with `unknown` input and permissive defaults.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/manager/src/lib/utils/value-guards.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 2: Apply guards to NodeCanvas + custom-node expansion/actions

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-expansion.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-actions.ts`

**Step 1: Write the failing test**

Add `custom-node-expansion.spec.ts` to assert guard usage:
- expansion handles missing payloads safely
- action parsing preserves defaults

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-expansion.spec.ts"`

Expected: FAIL (helper missing/unused).

**Step 3: Minimal implementation**

Replace `any` with `value-guards` helpers while keeping returned values identical.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-expansion.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 3: Apply guards to node spec registry + custom node utilities

**Files:**
- Modify: `apps/manager/src/lib/nodes/specs/register.ts`
- Modify: `apps/manager/src/lib/nodes/custom-nodes/flatten.ts`
- Modify: `apps/manager/src/lib/nodes/custom-nodes/store.ts`
- Modify: `apps/manager/src/lib/nodes/custom-nodes/io.ts`
- Modify: `apps/manager/src/lib/nodes/custom-nodes/instance.ts`

**Step 1: Write the failing test**

Add `custom-node-io.spec.ts` verifying IO parsing defaults to existing values when missing.

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/manager/src/lib/nodes/custom-nodes/custom-node-io.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Introduce guard usage in registry + custom node helpers without changing outputs.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/manager/src/lib/nodes/custom-nodes/custom-node-io.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 4: Apply guards to node-canvas runtime + controllers

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/runtime/patch-runtime.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteControl.svelte`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`

**Step 1: Write the failing test**

Add `group-port-nodes-controller.spec.ts` verifying:
- port resolution handles missing payloads safely
- collapsed socket derivation defaults unchanged

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Replace `any` casts with `value-guards` + typed interfaces, preserving logic.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/controllers/group-port-nodes-controller.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 5: Fix manager store warnings

**Files:**
- Modify: `apps/manager/src/lib/stores/assets.ts`
- Modify: `apps/manager/src/lib/stores/local-display-media.ts`
- Modify: `apps/manager/src/lib/stores/local-media.ts`
- Modify: `apps/manager/src/lib/stores/manager.ts`
- Modify: `apps/manager/src/lib/project/projectManager.ts`
- Modify: `apps/manager/src/lib/parameters/presets.ts`

**Step 1: Write the failing test**

Add `manager-store.spec.ts` verifying:
- payload guards preserve default values
- projectManager parsing does not throw on missing fields

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/manager/src/lib/stores/manager-store.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Use `value-guards` to replace `any` and keep defaults identical.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/manager/src/lib/stores/manager-store.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 6: Fix display lint warnings

**Files:**
- Modify: `apps/display/src/lib/components/ImageDisplay.svelte`
- Modify: `apps/display/src/lib/stores/display.ts`

**Step 1: Write the failing test**

Add `display-store.spec.ts` verifying:
- display state parsing defaults are preserved
- pendingUrl cleanup behavior remains

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/display/src/lib/stores/display-store.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Replace `any` with typed guards; remove unused `pendingUrl` if not used or wire it if required.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/display/src/lib/stores/display-store.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 7: Fix client lint warnings (stores + visual canvas)

**Files:**
- Modify: `apps/client/src/lib/components/VisualCanvas.svelte`
- Modify: `apps/client/src/lib/stores/client/client-control.ts`
- Modify: `apps/client/src/lib/stores/client/client-runtime.ts`
- Modify: `apps/client/src/lib/stores/client/client-screenshot.ts`
- Modify: `apps/client/src/lib/stores/client/client-tone.ts`
- Modify: `apps/client/src/lib/stores/client/client-visual.ts`
- Modify: `apps/client/src/routes/+page.svelte`

**Step 1: Write the failing test**

Add `client-store.spec.ts` verifying:
- runtime payload parsing defaults unchanged
- visual config parsing safe under missing fields

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "apps/client/src/lib/stores/client/client-store.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Add `value-guards` in client stores (local helper if needed) and replace `any` casts with guard calls.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "apps/client/src/lib/stores/client/client-store.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 8: Re-run lint

**Files:**
- Create/Update: `docs/plans/2026-01-15-lint-inventory-5.txt`

**Step 1: Lint**

Run: `pnpm lint > docs/plans/2026-01-15-lint-inventory-5.txt 2>&1`

Expected: 0 warnings (or updated inventory for remaining work).

**Step 2: Commit**

Skip.
