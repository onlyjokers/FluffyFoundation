# Node Graph Architecture Refactor Design (No UX Change)

**Goal:** Reduce Node Graph complexity without changing user-visible behavior. Establish clear module boundaries so future features do not recreate monolithic files.

## Constraints
- No change in user experience, behavior, or visuals.
- Maintain current Rete engine integration and graph serialization formats.
- Avoid cross-layer imports that reintroduce tight coupling.

## Architecture Summary
The Node Graph will be organized as a composition root that wires strict layers:

1) **Core Graph State**
- Graph state, selection state, group state, and custom node state.
- Pure utilities for graph transforms and lookups.

2) **Interaction Layer (Area + Connections)**
- Rete area plugin, connection plugin, history plugin setup.
- Pointer/keyboard handling and view transforms.

3) **Rendering Layer (Svelte)**
- Node/connection/control renderers and UI overlays.
- Rendering registry defines what UI components are used for which node types.

4) **Runtime Layer (Patch Execution)**
- Patch runtime, deploy/stop logic, and execution state.
- No direct UI imports. UI subscribes to runtime state via public adapter methods.

5) **Controllers (Feature Modules)**
- Group controller, minimap, picker, clipboard, loop, MIDI highlight.
- Controllers depend only on core state + adapter interfaces.

## Module Boundaries
- NodeCanvas.svelte becomes a thin composition root: create app, mount UI, pass dependencies.
- Rete renderer components (ReteNode/ReteControl/ReteConnection) become pure view modules.
- Custom node helpers and group frame logic move into dedicated files.
- All cross-module interactions must go through explicit adapter interfaces.

## Guardrails
- Dependency direction: UI -> controllers -> core/state; runtime does not import UI.
- Introduce a registry module for node/control renderers.
- Add small smoke tests for graph serialization and adapter wiring.

## Compatibility
This refactor preserves existing graph files, custom node definitions, and runtime behavior. It makes future work (e.g., code-splitting, multi-scene, or display-side graph) modular instead of monolithic.

## Baseline (Worktree)
- `pnpm lint` runs with existing warnings but no errors.

