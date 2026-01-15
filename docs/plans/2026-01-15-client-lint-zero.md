# Client Lint Zero Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all `apps/client` ESLint warnings (no-explicit-any, unused vars) without changing runtime behavior so the worktree can be merged safely.

**Architecture:** Keep behavior identical; only tighten types (`unknown`/`Record<string, unknown>`), add narrow helpers, and remove unused variables. Avoid logic changes.

**Tech Stack:** Svelte/SvelteKit, TypeScript, ESLint, pnpm.

---

### Task 1: Capture current lint warnings (baseline)

**Files:**
- Lint: `apps/client/src`

**Step 1: Run lint for client only**

Run: `pnpm exec eslint --format unix apps/client/src`
Expected: list of warnings (no errors).

---

### Task 2: Visual canvas warnings

**Files:**
- Modify: `apps/client/src/lib/components/VisualCanvas.svelte`

**Step 1: Replace `any` props/state with safe types**

Example:
```ts
// before
let value: any;

// after
let value: unknown;
```

For objects, use:
```ts
const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
```

**Step 2: Lint just this file**

Run: `pnpm exec eslint --format unix apps/client/src/lib/components/VisualCanvas.svelte`
Expected: no warnings.

---

### Task 3: Client control store warnings

**Files:**
- Modify: `apps/client/src/lib/stores/client/client-control.ts`

**Step 1: Replace `any` with `unknown` / `Record<string, unknown>`**

Use local helpers:
```ts
type AnyRecord = Record<string, unknown>;
const asRecord = (v: unknown): AnyRecord | null => (v && typeof v === 'object' ? (v as AnyRecord) : null);
```

**Step 2: Lint this file**

Run: `pnpm exec eslint --format unix apps/client/src/lib/stores/client/client-control.ts`
Expected: no warnings.

---

### Task 4: Client runtime warnings

**Files:**
- Modify: `apps/client/src/lib/stores/client/client-runtime.ts`

**Step 1: Replace `any` with `unknown` / `Record<string, unknown>`**

Prefer narrowing instead of casting.

**Step 2: Lint this file**

Run: `pnpm exec eslint --format unix apps/client/src/lib/stores/client/client-runtime.ts`
Expected: no warnings.

---

### Task 5: Client screenshot/tone/visual warnings

**Files:**
- Modify: `apps/client/src/lib/stores/client/client-screenshot.ts`
- Modify: `apps/client/src/lib/stores/client/client-tone.ts`
- Modify: `apps/client/src/lib/stores/client/client-visual.ts`

**Step 1: Replace `any` with `unknown` / `Record<string, unknown>`**

**Step 2: Lint these files**

Run:
```
pnpm exec eslint --format unix apps/client/src/lib/stores/client/client-screenshot.ts \
  apps/client/src/lib/stores/client/client-tone.ts \
  apps/client/src/lib/stores/client/client-visual.ts
```
Expected: no warnings.

---

### Task 6: Route page warnings

**Files:**
- Modify: `apps/client/src/routes/+page.svelte`

**Step 1: Replace `any` with `unknown` / `Record<string, unknown>`**

**Step 2: Lint this file**

Run: `pnpm exec eslint --format unix apps/client/src/routes/+page.svelte`
Expected: no warnings.

---

### Task 7: Final lint gate (client)

**Step 1: Full client lint**

Run: `pnpm exec eslint --format unix apps/client/src`
Expected: 0 warnings.

**Step 2: Full repo lint**

Run: `pnpm lint`
Expected: 0 warnings (exit 0).

**Step 3: Commit**

Run:
```
git add -A
git commit -m "chore: clear client lint warnings"
```

---

Plan complete and saved to `docs/plans/2026-01-15-client-lint-zero.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
