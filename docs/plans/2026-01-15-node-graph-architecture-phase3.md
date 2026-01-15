# Node Graph Architecture Refactor Plan (Phase 3)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Further reduce NodeCanvas size by extracting Custom Node actions and Group event wiring, with zero UX changes.

**Architecture:** Keep NodeCanvas as composition root; move domain logic into modules with explicit dependencies.

**Tech Stack:** Svelte/SvelteKit, Rete, TypeScript.

---

### Task 1: Extract Custom Node actions (uncouple / denodalize / nodalize)

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/custom-node-actions.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move handlers**
Move from NodeCanvas into `custom-node-actions.ts`:
- `handleUncoupleCustomNode`
- `handleDenodalizeGroup`
- `handleNodalizeGroup`

**Step 2: Provide factory API**
Export `createCustomNodeActions(opts)` returning the three handlers.

**Step 3: Update NodeCanvas**
Replace inline functions with handlers from the new module.

**Step 4: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 2: Extract Group event wiring

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/groups/group-events.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move event listener wiring**
Move the `window.addEventListener('shugu:toggle-group-minimized' ...)` and
`window.addEventListener('shugu:toggle-group-disabled' ...)` wiring into a helper
that returns handler references (and optional cleanup).

**Step 2: Update NodeCanvas**
Use the helper to register/unregister group events.

**Step 3: Run lint**
Run: `pnpm lint`
Expected: warnings only, no errors.

---

### Task 3: Document new modules

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/ARCHITECTURE.md`

**Step 1: Add notes**
Document the new custom-node-actions and group-events modules.

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

