# Node Graph Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split NodeCanvas into stable, layered modules without changing user-visible behavior.

**Architecture:** NodeCanvas becomes a composition root; controllers handle interactions; runtime handles patch/executor; UI is pure rendering; registries own renderer mappings; custom-nodes and groups encapsulate domain behavior.

**Tech Stack:** Svelte/SvelteKit, Rete.js, TypeScript, pnpm, ESLint.

---

### Task 1: Establish invariants + map responsibilities

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`
- Create: `docs/plans/2026-01-15-node-graph-architecture-notes.md`

**Step 1: Add a mapping note doc**
Document current responsibilities (selection, group, custom-node, runtime wiring) with file line anchors.

**Step 2: Mark invariants in NodeCanvas**
Add inline comments that mark "do not change behavior" boundaries while moving code (no logic change).

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 2: Finalize registry boundaries

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`
- Modify/Create: `apps/manager/src/lib/components/nodes/node-canvas/registry/renderers.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/rete/setup-rete-render.ts`

**Step 1: Move renderer mappings**
Ensure all node/control/connection renderer bindings live under `registry/` and are imported by `setup-rete-render.ts`.

**Step 2: Wire from NodeCanvas**
Replace inline renderer wiring with registry exports.

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 3: Extract lifecycle + cleanup

**Files:**
- Modify/Create: `apps/manager/src/lib/components/nodes/node-canvas/lifecycle/cleanup.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move teardown logic**
Create `cleanup.ts` to own unsubscribes, timers, RAF cancellations.

**Step 2: Call cleanup from NodeCanvas**
NodeCanvas should call lifecycle cleanup on destroy; no logic change.

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 4: Extract custom-nodes domain logic

**Files:**
- Modify/Create: `apps/manager/src/lib/components/nodes/node-canvas/custom-nodes/*`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move nodalize/denodalize/uncouple handlers**
Relocate handlers into custom-nodes modules and expose a minimal API.

**Step 2: Bind events from NodeCanvas**
NodeCanvas wires event emitters → custom-nodes handlers, without embedding logic.

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 5: Extract group domain logic

**Files:**
- Modify/Create: `apps/manager/src/lib/components/nodes/node-canvas/groups/*`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Move group frame event handlers**
Relocate group frame event binding/dispatch to `groups/` modules.

**Step 2: Keep controller responsibilities**
Ensure group-controller only owns state/queries; UI events route through groups modules.

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 6: Runtime wiring consolidation

**Files:**
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/runtime/*`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`

**Step 1: Centralize runtime wiring**
Move NodeCanvas runtime setup into a single runtime "init" module.

**Step 2: NodeCanvas consumes runtime init**
Keep logic identical; only move wiring.

**Step 3: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib/components/nodes`
Expected: no warnings.

---

### Task 7: Manual regression checkpoints

**Step 1: Core graph operations**
Run the known manual flows: add/connect/disconnect, group collapse/expand, nodalize/denodalize, loop deploy, display routing.

**Step 2: Record results**
Update `docs/PlanDocs/0109_RootManagerControlPlane/plan_progress.md` with pass/fail notes.

---

### Task 8: Final verification (no commit)

**Step 1: Lint**
Run: `pnpm exec eslint --format unix apps/manager/src/lib`
Expected: no warnings in manager scope.

**Step 2: Stage for user review**
Prepare `git status -sb` for you to review. (No commit performed.)
