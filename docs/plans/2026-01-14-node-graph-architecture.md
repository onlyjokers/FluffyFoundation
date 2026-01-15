# Node Graph Architecture Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the Node Graph code so it is modular and maintainable without any user-visible behavior change.

**Architecture:** Keep Rete + Svelte rendering as-is, but move NodeCanvas logic into dedicated modules: registry, helpers, setup, and lifecycle. NodeCanvas becomes a composition root with explicit interfaces between core state, controllers, runtime, and UI.

**Tech Stack:** Svelte/SvelteKit, Rete (area/connection/history), TypeScript, pnpm.

---

### Task 1: Add a renderer registry for Node Graph UI

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/registry/renderers.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Write a minimal registry module**
```ts
import ReteNode from '../rete/ReteNode.svelte';
import ReteControl from '../rete/ReteControl.svelte';
import ReteConnection from '../rete/ReteConnection.svelte';

export const reteRenderers = {
  node: () => ReteNode,
  connection: () => ReteConnection,
  control: () => ReteControl,
};
```

**Step 2: Use the registry in NodeCanvas**
- Replace inline `customize` mapping with `reteRenderers`.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors (baseline already has warnings).

---

### Task 2: Extract custom node ID helpers

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-ids.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move helper functions**
Move these functions from NodeCanvas into the new module:
- `materializeInternalNodeId`
- `isMaterializedInternalNodeId`
- `internalNodeIdFromMaterialized`
- `customNodeIdFromMaterializedNodeId`

**Step 2: Update imports in NodeCanvas**
- Import the helpers from `custom-node-ids.ts`.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 3: Extract group tree helper

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/groups/group-tree.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move `deepestGroupIdContainingNode`**
- Copy the function into `group-tree.ts` and export it.

**Step 2: Update NodeCanvas**
- Import and use the function from the new module.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 4: Extract Rete render setup into a helper

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/rete/setup-rete-render.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move the render plugin preset setup**
- Wrap `SveltePresets.classic.setup` + `socketPositionWatcher` creation in a helper.
- The helper should accept `requestFramesUpdate`, `socketPositionWatcher` (optional), and `reteRenderers`.

**Step 2: Use helper in NodeCanvas**
- Replace the inline `render.addPreset(...)` block.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 5: Consolidate NodeCanvas cleanup

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/lifecycle/cleanup.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Extract cleanup logic**
- Move the `onDestroy` cleanup body into `cleanup.ts` as `destroyNodeCanvasResources(ctx)`.
- `ctx` should contain all mutable refs used in cleanup.

**Step 2: Replace NodeCanvas cleanup**
- Call `destroyNodeCanvasResources(...)` inside `onDestroy`.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 6: Document Node Graph boundaries

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/ARCHITECTURE.md`

**Step 1: Add module boundary rules**
- List allowed import directions (UI -> controllers -> core; runtime independent of UI).
- Note the registry and helper modules.

**Step 2: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 7: Final verification

**Files:**
- None

**Step 1: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

**Step 2: Manual smoke check (non-automated)**
- Open manager Node Graph and verify no visual/interaction changes.

---

**Notes:**
- Do not commit; user will commit.
- Preserve UX 1:1; this is structural refactor only.

