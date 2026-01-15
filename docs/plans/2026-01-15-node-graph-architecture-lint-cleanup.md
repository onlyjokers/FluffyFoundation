# Node Graph Architecture Lint Cleanup Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Commit the current Node Graph architecture refactor, then eliminate all `apps/manager` ESLint warnings without changing runtime behavior.

**Architecture:** Keep behavior identical; only type tightening / unused imports removal. Replace `any` with `unknown`/`Record<string, unknown>` and introduce minimal local types where needed. No logic changes.

**Tech Stack:** Svelte/SvelteKit, TypeScript, ESLint, pnpm.

---

### Task 1: Commit current refactor baseline

**Files:**
- Modify: all currently changed files in worktree
- Add: new node-canvas modules + docs + server fixes

**Step 1: Inspect working tree**

Run: `git status -sb`

**Step 2: Stage all intended changes**

Run: `git add -A`

**Step 3: Commit**

Run:
```bash
git commit -m "refactor: split node graph canvas architecture"
```

---

### Task 2: Clean UI component warnings (low‑risk)

**Files:**
- Modify: `apps/manager/src/lib/components/ConnectionMenu.svelte`
- Modify: `apps/manager/src/lib/components/RegistryMidiPanel.svelte`
- Modify: `apps/manager/src/lib/components/SensorDisplay.svelte`
- Modify: `apps/manager/src/lib/components/ui/Select.svelte`
- Modify: `apps/manager/src/lib/components/parameters/ParamWidgetFactory.svelte`
- Modify: `apps/manager/src/lib/components/parameters/ParameterControl.svelte`
- Modify: `apps/manager/src/lib/components/parameters/widgets/ParamSlider.svelte`

**Step 1: Replace `any` props with minimal safe types**

Example pattern:
```ts
// before
export let value: any;

// after
export let value: unknown;
```

For object props, prefer:
```ts
export let value: Record<string, unknown> | null = null;
```

**Step 2: Remove unused imports**

Example:
```ts
// before
import { onMount, onDestroy } from 'svelte';
// after
// (remove import if unused)
```

**Step 3: Lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib/components`
Expected: warnings only from non‑UI files.

---

### Task 3: Clean store + helper warnings

**Files:**
- Modify: `apps/manager/src/lib/display/display-bridge.ts`
- Modify: `apps/manager/src/lib/features/assets/media-timeline-preview.ts`
- Modify: `apps/manager/src/lib/features/location/GeoControl.svelte`
- Modify: `apps/manager/src/lib/features/midi/midi-templates.ts`
- Modify: `apps/manager/src/lib/parameters/presets.ts`
- Modify: `apps/manager/src/lib/stores/assets.ts`
- Modify: `apps/manager/src/lib/stores/local-display-media.ts`
- Modify: `apps/manager/src/lib/stores/local-media.ts`
- Modify: `apps/manager/src/lib/stores/manager.ts`

**Step 1: Replace `any` with `unknown` or `Record<string, unknown>`**

Example patterns:
```ts
// replace any
const payload: Record<string, unknown> = ...

// for arrays
const items: Array<Record<string, unknown>> = ...
```

**Step 2: Remove unused variables**

Example:
```ts
// before
const ctx = ...; // unused
// after
// remove
```

**Step 3: Lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib/features apps/manager/src/lib/stores apps/manager/src/lib/parameters`
Expected: warnings only from nodes/engine/specs/export/projectManager.

---

### Task 4: Clean project manager + patch export warnings

**Files:**
- Modify: `apps/manager/src/lib/project/projectManager.ts`
- Modify: `apps/manager/src/lib/nodes/patch-export.ts`

**Step 1: Replace `any` with `unknown` and narrow**

Example:
```ts
const record = raw as Record<string, unknown>;
```

**Step 2: Lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib/project apps/manager/src/lib/nodes/patch-export.ts`
Expected: warnings only from nodes/engine + nodes/specs/register.

---

### Task 5: Clean nodes/engine warnings

**Files:**
- Modify: `apps/manager/src/lib/nodes/engine.ts`

**Step 1: Introduce local helper types**

Example:
```ts
type AnyRecord = Record<string, unknown>;
type NodeValueMap = Record<string, unknown>;
```

**Step 2: Replace `any` with helper types**

Example:
```ts
const config = asRecord(node.config) as AnyRecord;
```

**Step 3: Lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib/nodes/engine.ts`
Expected: no warnings in engine.

---

### Task 6: Clean nodes/specs/register warnings

**Files:**
- Modify: `apps/manager/src/lib/nodes/specs/register.ts`

**Step 1: Introduce local helper types**

Example:
```ts
type AnyRecord = Record<string, unknown>;
type PortValue = unknown;
```

**Step 2: Replace `any` with helper types**

Example:
```ts
const nodeConfig: AnyRecord = asRecord(config);
```

**Step 3: Lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib/nodes/specs/register.ts`
Expected: no warnings in register.

---

### Task 7: Final lint gate

**Step 1: Full manager lint**

Run: `pnpm exec eslint --format unix apps/manager/src/lib`
Expected: 0 warnings.

**Step 2: Commit lint cleanup**

Run:
```bash
git add -A
git commit -m "chore: clear manager lint warnings"
```

---

Plan complete and saved to `docs/plans/2026-01-15-node-graph-architecture-lint-cleanup.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
