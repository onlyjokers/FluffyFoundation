# Node Canvas Architecture

## Goal
Keep Node Graph behavior unchanged while preventing NodeCanvas from becoming monolithic.

## Module Boundaries
- **UI (Svelte components)** may depend on controllers and adapter interfaces.
- **Controllers** may depend on core state and adapters; avoid importing UI components.
- **Runtime (patch execution)** must not import UI components.
- **Core state + utilities** should remain pure and side-effect free.

## Registries
- `registry/renderers.ts` defines the Rete renderer mapping (node/connection/control).

## Helpers
- `custom-nodes/custom-node-ids.ts` contains custom node materialization helpers.
- `groups/group-tree.ts` contains group hierarchy helpers.

## Lifecycle
- `lifecycle/cleanup.ts` centralizes teardown logic for NodeCanvas.

## Composition Root
- `NodeCanvas.svelte` remains the composition root, wiring dependencies without embedding business logic.

- `custom-nodes/custom-node-expansion.ts` owns Custom Node expand/collapse behavior.
- `custom-nodes/custom-node-events.ts` binds Custom Node UI events to handlers.
- `custom-nodes/custom-node-actions.ts` owns nodalize/denodalize/uncouple logic.
- `groups/group-events.ts` binds Group frame UI events to handlers.
