<!--
Purpose: Handoff FF-08 Root/Manager product split implementation to Review.
-->

# FF-08 Root/Manager Product Split Handoff

## Decision

PASS candidate for Review.

## Changed Areas

- `apps/manager/src/routes/+page.svelte`: Manager is now the lightweight performance console and no longer imports Root editor/project modules.
- `apps/manager/src/routes/root/**`: Root owns authoring, asset/recovery token entry, Group publishing, project recovery/autosave, heavy Rete/NodeCanvas route loading, and Global Stop.
- `apps/manager/src/lib/stores/domain/**`: Adds domain store facades for connection, client registry view, display status, and group controls.
- `apps/manager/src/lib/stores/group-controls.ts`: Adds published Group normalization and group-targeted control helpers.
- `apps/manager/src/lib/components/PublishedGroupControls.svelte`: Adds Manager-facing published Group controls.
- `package.json`: Wires `test:ff08` and `guard:ff08` into `pnpm verify`.
- `.harness/scripts/ff08/guard-manager-boundary.mjs`: Tracked FF-08 Manager boundary guard used by `pnpm verify`.
- `.harness/evidence/FF-08/summary.md`: Tracked FF-08 source-of-truth evidence summary; raw runtime captures remain local evidence artifacts.
- `.gitignore`: Unignores only the FF-08 summary and handoff source-of-truth artifacts while keeping raw runtime captures ignored.

## Checks

- PASS: `pnpm test:ff08` (3 tests, 0 failures).
- PASS: `pnpm guard:ff08 --source-only`.
- PASS: `git diff --check`.
- PASS: `pnpm build:all`.
- PASS: `pnpm guard:ff08`.
- PASS: `pnpm verify`.
- PASS: Harness-compliance correction reran `pnpm guard:ff08 --source-only`, `pnpm test:ff08`, `git diff --check`, `pnpm build:all`, and `pnpm verify` after moving the guard to `.harness/scripts/ff08/`.

Observed warnings during passing checks:

- Baseline lint warnings in `packages/sdk-client/src/tone-adapter/types.ts`.
- Baseline Svelte/Rete build warnings in Root authoring code and SvelteKit/Svelte export warnings.
- Baseline hotspot warnings; the new Root route split satisfies the hotspot ratchet.
- Node spec validation reports 26 warnings and 0 errors.

## UI / Runtime Evidence

- Manager proof: `.harness/evidence/FF-08/manager-group-controls-snapshot.yml` and `manager-controls-console.log`.
  - Shows published Group controls for `Audience` and `Display`.
  - Verified `Send Color`, `Vibrate`, `Stop Group`, and `Stop Published Groups` browser clicks with 0 console errors.
  - Manager connect screen excludes the Root asset-write token control.
- Root proof: `.harness/evidence/FF-08/root-authoring-snapshot.yml` and `root-authoring-console.log`.
  - Shows `Root Console`, `Assets Manager`, `Registry MIDI`, and `Node Graph`.
  - Shows `Publish Groups` and `Global Stop` actions.
- Bundle proof: `.harness/evidence/FF-08/summary.md`.
  - Latest Manager route bundle: `nodes/2.DqbDrxPe.js`, 21.57 kB.
  - Latest Root route bundle: `nodes/3.V8ZTXS6z.js`, 855.11 kB.
  - `guard-manager-boundary.mjs` follows the built Vite manifest and blocks Manager route assets containing NodeCanvas/Rete markers.

## Residual Risks

- Published Groups are currently local/default summaries plus Root-published snapshots; server-persisted Group publishing is outside FF-08 and should not be treated as FF-09 command bus work.
- Runtime proof used the already-running local server on port 3001 and local dev Manager on port 5173.
- Root route still carries the full heavy authoring runtime by design.

## Rollback / Recovery

- Revert `apps/manager/src/routes/root/**`, `apps/manager/src/routes/+page.svelte`, the domain store facades, `PublishedGroupControls.svelte`, and group-control store/test files.
- Remove `guard:ff08` and `test:ff08` script wiring from `package.json`.
- Remove `.harness/scripts/ff08/guard-manager-boundary.mjs` and FF-08 `.gitignore` exceptions.
- If a temporary emergency rollback is needed, restore the pre-FF-08 all-in-one `apps/manager/src/routes/+page.svelte` from history and remove `/manager/root`.
