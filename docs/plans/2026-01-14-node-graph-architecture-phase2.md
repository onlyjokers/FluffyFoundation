# Node Graph Architecture Refactor Plan (Phase 2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Further reduce NodeCanvas complexity by extracting custom-node expansion logic and event wiring into dedicated modules, without any UX changes.

**Architecture:** Continue isolating domain-specific logic into helpers/services, keeping NodeCanvas as composition root. Preserve all runtime/UI behavior.

**Tech Stack:** Svelte/SvelteKit, Rete, TypeScript.

---

### Task 1: Extract Custom Node expansion helpers

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-expansion.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move custom-node expansion helpers**
Move these from NodeCanvas:
- `ExpandedCustomNodeFrame` type
- `refreshExpandedCustomGroupIds`
- `rehydrateExpandedCustomFrames`
- `handleExpandCustomNode`
- `handleCollapseCustomNodeFrame`

**Step 2: Provide a small API**
Export a factory `createCustomNodeExpansion(opts)` that returns the handlers and exposes `expandedCustomGroupIds` as a `Set<string>` getter.

**Step 3: Update NodeCanvas**
Replace inline functions with the new module.

**Step 4: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 2: Extract event wiring for custom-node actions

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-events.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move event listener setup**
Move the `window.addEventListener('shugu:custom-node-uncouple', ...)` and `window.addEventListener('shugu:custom-node-expand', ...)` wiring into a helper that returns cleanup callbacks.

**Step 2: Update NodeCanvas**
Use the helper to register/unregister custom-node events.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 3: Document new custom-node modules

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/ARCHITECTURE.md`

**Step 1: Add notes**
Document the new custom-node expansion and event modules.

**Step 2: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 4: Final verification

**Files:**
- None

**Step 1: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

**Step 2: Manual smoke check (non-automated)**
Open manager Node Graph and verify no visual/interaction changes.

---

**Notes:**
- Do not commit; user will commit.
- Preserve UX 1:1; this is structural refactor only.

