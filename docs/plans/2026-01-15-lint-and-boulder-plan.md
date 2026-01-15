# Repo Lint + Boulder Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate current lint warnings and reduce core boulder files while preserving user-visible behavior.

**Architecture:** Keep UI composition roots thin, extract pure helpers into test-covered modules, and tighten types without runtime changes.

**Tech Stack:** TypeScript, SvelteKit, Node test runner (`tsx`), ESLint.

### Task 1: Capture lint warning inventory

**Files:**
- Create: `docs/plans/2026-01-15-lint-inventory.txt`

**Step 1: Run lint with captured output**

Run: `pnpm lint > docs/plans/2026-01-15-lint-inventory.txt 2>&1`

Expected: command finishes; warnings recorded in file.

**Step 2: Commit**

Skip (user requested manual commits).

### Task 2: Fix protocol helper warning (unused import) with tests

**Files:**
- Create: `packages/protocol/src/helpers.spec.ts`
- Modify: `packages/protocol/src/helpers.ts`

**Step 1: Write the failing test**

Create `packages/protocol/src/helpers.spec.ts` covering `createControlMessage` + `matchesTarget`:
- `matchesTarget` returns true for mode `all`
- `matchesTarget` matches group
- `createControlMessage` fills version + clientTimestamp

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/protocol/src/helpers.spec.ts"`

Expected: FAIL because test file or imports fail before change.

**Step 3: Minimal implementation**

Adjust `helpers.ts` to remove unused `ClientInfo` import while preserving behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "packages/protocol/src/helpers.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 3: Fix multimedia-core any warnings via typed JSON parsing

**Files:**
- Create: `packages/multimedia-core/src/multimedia-core.spec.ts`
- Modify: `packages/multimedia-core/src/multimedia-core.ts`

**Step 1: Write the failing test**

Add tests for JSON parsing helpers (to be extracted) to ensure:
- invalid JSON shape returns null fields
- valid JSON returns sha256/mimeType/sizeBytes

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/multimedia-core/src/multimedia-core.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Extract JSON parsing helper(s) inside `multimedia-core.ts` and replace `any` casts with `unknown` + guards.

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test "packages/multimedia-core/src/multimedia-core.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 4: Fix sdk-manager any warnings in control batching

**Files:**
- Create: `packages/sdk-manager/src/manager-sdk.spec.ts`
- Modify: `packages/sdk-manager/src/manager-sdk.ts`

**Step 1: Write the failing test**

Add tests for control-batch payload merging behavior in `queueControl`:
- merges `modulateSoundUpdate` payloads as shallow object merge
- preserves non-merge actions as-is

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/sdk-manager/src/manager-sdk.spec.ts"`

Expected: FAIL (helper missing or behavior not exposed).

**Step 3: Minimal implementation**

Extract a typed `mergeControlPayload` helper and replace `any` casts with guarded object merges.

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test "packages/sdk-manager/src/manager-sdk.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 5: Fix apps/server warnings (typed payloads, unused vars)

**Files:**
- Create: `apps/server/src/utils/error-utils.ts`
- Create: `apps/server/src/utils/error-utils.spec.ts`
- Create: `apps/server/src/utils/request-utils.ts`
- Create: `apps/server/src/utils/request-utils.spec.ts`
- Modify: `apps/server/src/app.controller.ts`
- Modify: `apps/server/src/assets/assets.auth.ts`
- Modify: `apps/server/src/assets/assets.controller.ts`
- Modify: `apps/server/src/assets/assets.service.ts`
- Modify: `apps/server/src/geo/geo.controller.ts`
- Modify: `apps/server/src/local-media/local-media.controller.ts`
- Modify: `apps/server/src/main.ts`

**Step 1: Write failing tests**

Add tests for request/body/query parsing helpers + error code extraction.

**Step 2: Run tests to verify they fail**

Run: `pnpm tsx --test "apps/server/src/**/*.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Replace `any` with explicit types/guards and remove unused vars (rename `_backend`/`_key` to `_backendUnused` only if used or remove unused destructuring).

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test "apps/server/src/**/*.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 6: Re-run lint

**Files:**
- None

**Step 1: Lint**

Run: `pnpm lint`

Expected: 0 warnings.

**Step 2: Commit**

Skip.

### Task 7: Fix node-core lint warnings (definitions + runtime)

**Files:**
- Create: `packages/node-core/src/definitions/nodes/node-definition-utils.ts`
- Create: `packages/node-core/src/definitions/nodes/node-definition-utils.spec.ts`
- Modify: `packages/node-core/src/definitions/nodes/assets.ts`
- Modify: `packages/node-core/src/definitions/nodes/audio.ts`
- Modify: `packages/node-core/src/definitions/nodes/client.ts`
- Modify: `packages/node-core/src/definitions/nodes/effects.ts`
- Modify: `packages/node-core/src/definitions/nodes/logic.ts`
- Modify: `packages/node-core/src/definitions/nodes/player.ts`
- Modify: `packages/node-core/src/definitions/nodes/processors.ts`
- Modify: `packages/node-core/src/definitions/nodes/scenes.ts`
- Modify: `packages/node-core/src/runtime.ts`

**Step 1: Write failing tests**

Add tests for shared node-definition helpers (label/enum parsing + config guards) to eliminate `any` while preserving behavior.

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test \"packages/node-core/src/definitions/nodes/node-definition-utils.spec.ts\"`

Expected: FAIL (helper missing).

### Task 8: Fix ui-kit VideoPlayer `any` warnings via typed helpers

**Files:**
- Create: `packages/ui-kit/src/components/video-player-audio.ts`
- Create: `packages/ui-kit/src/components/video-player-audio.spec.ts`
- Modify: `packages/ui-kit/src/components/VideoPlayer.svelte`

**Step 1: Write the failing test**

Create `video-player-audio.spec.ts` covering:
- `resolveToneRawContext()` returns `null` when module is missing context
- `resolveToneRawContext()` returns `rawContext` when present
- `getAudioContextCtor()` picks `AudioContext` over `webkitAudioContext`
- `asPromiseLike()` returns `null` for non-promises

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/ui-kit/src/components/video-player-audio.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Add `video-player-audio.ts` with typed helpers (accept `unknown`, return typed values), then replace `any` usage in `VideoPlayer.svelte` by calling the helpers.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "packages/ui-kit/src/components/video-player-audio.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 9: Fix visual-effects `any` warnings via effect guard helpers

**Files:**
- Create: `packages/visual-effects/src/effect-guards.ts`
- Create: `packages/visual-effects/src/effect-guards.spec.ts`
- Modify: `packages/visual-effects/src/pipeline.ts`

**Step 1: Write the failing test**

Add tests verifying:
- `getEffectType()` returns empty string for non-objects
- `getAsciiConfig()` clamps `scale` and defaults `cellSize`
- `getConvolutionConfig()` returns `null` for invalid objects

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/visual-effects/src/effect-guards.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Implement guards using `unknown` + runtime checks, then replace `(effect as any)` usages in `pipeline.ts` with guard helpers.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "packages/visual-effects/src/effect-guards.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 10: Fix sdk-client `any` warnings (sensor + node-executor)

**Files:**
- Create: `packages/sdk-client/src/browser/audio-context.ts`
- Create: `packages/sdk-client/src/browser/audio-context.spec.ts`
- Modify: `packages/sdk-client/src/sensor-manager.ts`
- Modify: `packages/sdk-client/src/node-executor.ts`

**Step 1: Write the failing test**

Add tests for `getBrowserAudioContextCtor()`:
- returns `null` when no constructors
- prefers `AudioContext` over `webkitAudioContext`

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/sdk-client/src/browser/audio-context.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Implement helper in `audio-context.ts` and replace `(window as any)` audio context accesses in `sensor-manager.ts` + `node-executor.ts` with typed helpers.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "packages/sdk-client/src/browser/audio-context.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 11: Fix sdk-client tone-adapter `any` warnings (type-safe wrappers)

**Files:**
- Create: `packages/sdk-client/src/tone-adapter/tone-guards.ts`
- Create: `packages/sdk-client/src/tone-adapter/tone-guards.spec.ts`
- Modify: `packages/sdk-client/src/tone-adapter/types.ts`
- Modify: `packages/sdk-client/src/tone-adapter/engine-host.ts`
- Modify: `packages/sdk-client/src/tone-adapter/nodes.ts`
- Modify: `packages/sdk-client/src/tone-adapter/register.ts`
- Modify: `packages/sdk-client/src/tone-adapter/state.ts`
- Modify: `packages/sdk-client/src/action-executors.ts`

**Step 1: Write the failing test**

Add guard tests for:
- `asToneModule()` returns `null` for non-objects
- `getToneContext()` returns `rawContext` when present
- `asRecord()` returns empty record for invalid payloads

**Step 2: Run test to verify it fails**

Run: `pnpm tsx --test "packages/sdk-client/src/tone-adapter/tone-guards.spec.ts"`

Expected: FAIL (helper missing).

**Step 3: Minimal implementation**

Add `tone-guards.ts` to centralize `unknown` → typed conversions and replace `(payload as any)` and `(mod as any)` uses with helpers. Update `types.ts` to avoid `any` by introducing `ToneNodeLike` / `ToneParamLike` interfaces.

**Step 4: Run test to verify it passes**

Run: `pnpm tsx --test "packages/sdk-client/src/tone-adapter/tone-guards.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 12: Node Graph boulder extraction (NodeCanvas, ReteControl, ReteNode)

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/state/node-canvas-state.ts`
- Create: `apps/manager/src/lib/components/nodes/node-canvas/state/node-canvas-state.spec.ts`
- Create: `apps/manager/src/lib/components/nodes/node-canvas/actions/node-canvas-actions.ts`
- Create: `apps/manager/src/lib/components/nodes/node-canvas/actions/node-canvas-actions.spec.ts`
- Modify: `apps/manager/src/lib/components/nodes/NodeCanvas.svelte`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteControl.svelte`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/rete/ReteNode.svelte`

**Step 1: Write the failing tests**

Add tests for pure helpers extracted from `NodeCanvas.svelte`:
- selection serialization and restore
- viewport clamp/normalize helpers
- group list normalization invariants

**Step 2: Run tests to verify they fail**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/state/node-canvas-state.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Move pure helpers (no DOM references) from `NodeCanvas.svelte` into `state/` and `actions/` modules and import them back, keeping rendering identical.

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/state/node-canvas-state.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 13: Node Graph controller extraction (group + clipboard + minimap)

**Files:**
- Create: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller-helpers.ts`
- Create: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller-helpers.spec.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/clipboard-controller.ts`
- Modify: `apps/manager/src/lib/components/nodes/node-canvas/controllers/minimap-controller.ts`

**Step 1: Write the failing tests**

Add tests for group-controller pure helpers:
- group split/merge invariants
- collapsed socket derivation invariants

**Step 2: Run tests to verify they fail**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller-helpers.spec.ts"`

Expected: FAIL (helpers missing).

**Step 3: Minimal implementation**

Extract pure helpers from controller implementations and wire them back, preserving controller side-effects.

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test "apps/manager/src/lib/components/nodes/node-canvas/controllers/group-controller-helpers.spec.ts"`

Expected: PASS.

**Step 5: Commit**

Skip.

### Task 14: Re-run lint and capture inventory

**Files:**
- Create/Update: `docs/plans/2026-01-15-lint-inventory-4.txt`

**Step 1: Lint**

Run: `pnpm lint > docs/plans/2026-01-15-lint-inventory-4.txt 2>&1`

Expected: 0 warnings (or updated inventory for remaining work).

**Step 2: Commit**

Skip.

**Step 3: Minimal implementation**

Introduce typed helpers and replace `any` casts with safe guards across node definitions + runtime.

**Step 4: Run tests to verify they pass**

Run: `pnpm tsx --test \"packages/node-core/src/definitions/nodes/node-definition-utils.spec.ts\"`

Expected: PASS.

**Step 5: Re-run lint**

Run: `pnpm lint`

Expected: 0 warnings.

**Step 6: Commit**

Skip.
