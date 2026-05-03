<!--
Purpose: Record FF-10 Node Registry V2 implementation evidence for Review.
-->

# FF-10 Evidence - Node Registry V2

## Boundary

- Added V2 node metadata types for version, platform targets, side-effect class, permissions, compatibility, examples, risks, repair hints, descriptions, units, ranges, and defaults.
- Added a shared `NodeRegistry.load` / factory / overlay path in `@shugu/node-core`.
- Manager JSON specs now apply metadata and overlays through the shared node-core loader instead of its own overlay merge path.
- Semantic snapshots include compact `aiSummary` records for command-bus and AI context without UI layout fields.
- Added a no-global-switch fixture test and AI context snapshot test in `packages/node-core/test/node-registry-v2.test.mjs`.

## Proof

- `pnpm validate:node-specs` passed with existing runtime-ignored overlay warnings and `0 errors`.
- `node --test packages/node-core/test/node-registry-v2.test.mjs` passed: `2` tests, `0` failures.
- `pnpm --filter @shugu/node-core run test` passed: `35` tests, `0` failures.
- `pnpm test:node-core` passed: `35` tests, `0` failures.
- `pnpm build:all` completed successfully. It still emits existing Svelte/SvelteKit/Rete warnings unrelated to FF-10.

## Evidence Files

- `registry-v2-fixture.mjs` emits the fixture AI-context snapshot from the shared registry factory loader.
- `registry-v2-snapshot.json` records the auto-registered fixture node summary.

## Scope Notes

- No new package, dependency, public topology shift, or protocol-breaking change was introduced.
- No visible Manager Add-menu behavior was intentionally changed; runtime/browser proof was not required.
- Existing dirty `.looooper/workflow.yaml` was left untouched and remains out of scope.
