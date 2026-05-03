<!--
Purpose: FF-08 evidence summary for Root/Manager product split.
-->

# FF-08 Evidence Summary

## Implementation Boundary

- `/manager` is now a lightweight performance console centered on published Group controls.
- `/manager/root` owns Root authoring surfaces: graph editing, asset/recovery token entry, Group publishing, recovery/project autosave, and Global Stop.
- Shared Manager stores are split through domain facades for connection, client registry view, display status, group controls, and Root authoring.
- Root route was split into `RootConnectPanel.svelte`, `RootWorkspace.svelte`, and `+page.svelte` so the harness hotspot ratchet remains satisfied.

## Focused Red/Green Proof

- `pnpm test:ff08` initially failed because `apps/manager/src/lib/stores/group-controls.ts` did not exist.
- `pnpm guard:ff08 --source-only` initially failed because `apps/manager/src/routes/+page.svelte` imported `$lib/nodes`, `NodeCanvasRenderer`, `RegistryMidiPanel`, and `projectManager`.
- After implementation, `pnpm test:ff08` passes 3 tests and `pnpm guard:ff08` passes against source and built bundle output.

## Bundle Evidence

- `pnpm build:all` passed.
- `pnpm verify` passed, including `pnpm guard:ff08`.
- Latest Manager build separates the default Manager route from the Root route:
  - Manager route: `.svelte-kit-manager/output/client/_app/immutable/nodes/2.DqbDrxPe.js`, 21.57 kB.
  - Root route: `.svelte-kit-manager/output/client/_app/immutable/nodes/3.V8ZTXS6z.js`, 855.11 kB and contains the Rete/NodeCanvas authoring bundle.
- `pnpm guard:ff08` runs `.harness/scripts/ff08/guard-manager-boundary.mjs`, reads the built Vite manifest, follows Manager route imports, and fails if Manager assets contain `NodeCanvas`, `node-canvas`, `Rete`, or `rete` markers.
- Harness compliance correction moved the executable guard from ignored `.harness/evidence/FF-08/` into tracked `.harness/scripts/ff08/guard-manager-boundary.mjs`.
- `.gitignore` now unignores only `.harness/evidence/FF-08/summary.md` and the FF-08 handoff as source-of-truth artifacts; raw runtime captures remain ignored local evidence.

## Browser Runtime Evidence

Using Playwright CLI with HTTPS errors ignored for local self-signed dev certs:

- Manager route: `https://127.0.0.1:5173/manager/`
  - Cookie-authenticated as `Eureka`.
  - Connected to existing local server at `https://127.0.0.1:3001` using WebSocket-only mode.
  - Rendered `Published Group Controls` with `Audience` and `Display` Groups.
  - Clicked `Send Color`, `Vibrate`, `Stop Group`, and `Stop Published Groups`; console evidence showed 0 errors.
  - Visible Manager body did not include Root editor tabs (`Assets Manager`, `Registry MIDI`, `Node Graph`) or asset-write token controls.
- Root route: `https://127.0.0.1:5173/manager/root`
  - Connected to the same server.
  - Rendered Root authoring tabs: `Root Console`, `Assets Manager`, `Registry MIDI`, `Node Graph`.
  - Rendered Root actions: `Publish Groups` and `Global Stop`.

Artifacts:

- `manager-login-snapshot.yml`
- `manager-initial-snapshot.yml`
- `manager-group-controls-snapshot.yml`
- `manager-controls-console.log`
- `root-route-snapshot.yml`
- `root-authoring-snapshot.yml`
- `root-authoring-console.log`
- `post-refactor-console.log`
- `playwright-cli.config.json`

## Residual Risks

- Build output still includes pre-existing Svelte/Rete warnings from Root authoring code and SvelteKit/Svelte version export warnings; verification passes with these warnings.
- `pnpm verify` reports baseline lint warnings in `packages/sdk-client/src/tone-adapter/types.ts` and baseline hotspot warnings; all gates pass.
- Runtime proof reused an already-running local server on port 3001; health check confirmed it was live.
- Fresh harness-compliance verification after the guard move passed: `pnpm guard:ff08 --source-only`, `pnpm test:ff08`, `git diff --check`, `pnpm build:all`, and `pnpm verify`.

## Rollback / Recovery

- Revert the route split and domain-store additions to return `/manager` to the previous all-in-one authoring surface.
- Remove `guard:ff08` and `test:ff08` script wiring if reverting the FF-08 boundary.
- Remove `.harness/scripts/ff08/guard-manager-boundary.mjs` and the FF-08 `.gitignore` exceptions if reverting this harness guard evidence wiring.
- Restore `apps/manager/src/routes/+page.svelte` from pre-FF-08 history if Manager must temporarily reabsorb Root editor functionality.
