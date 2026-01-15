# Node Graph Architecture Design

**Date:** 2026-01-15

## Goal
Keep Node Graph behavior unchanged while eliminating the "NodeCanvas巨石" growth path. The final shape must be stable, with strong module boundaries and a single composition root that only wires dependencies.

## Non‑Goals
- No visual/interaction changes.
- No protocol/SDK contract changes.
- No behavior or timing changes in runtime paths.

## Constraints
- Preserve user‑visible behavior exactly.
- UI must not reach into runtime internals directly.
- Runtime must not import UI.

## Architecture Principles (from validated references)
- **Core editor vs. rendering separation**: Rete’s editor core is UI‑agnostic and UI is handled by rendering plugins. This encourages a strict split between graph logic and UI rendering.
- **Plugins/Extensions for interaction**: Rete’s area/connection plugins handle interaction and selection, reinforcing a “controller → interaction” boundary separate from rendering.
- **Renderer swap‑ability**: Rete’s integration docs emphasize renderer independence to support different frameworks without affecting core logic.
- **Editor component composition**: Node‑RED editor documentation describes distinct editor components (header, palette, workspace, sidebar), supporting modular UI separation.

## Target Module Boundaries
```
UI (Svelte) → Controllers → Runtime → Core Utilities
Registry → UI/Controllers
NodeCanvas.svelte = composition root only
```

## Directory Layout (under node-canvas/)
- **registry/**: renderer mappings (node/control/connection). No business logic.
- **controllers/**: selection, drag, clipboard, group, loop, picker. Only state + adapters.
- **runtime/**: patch deployment, overrides, executor routing. No UI imports.
- **ui/**: overlays, panels, Svelte components. No runtime imports.
- **custom-nodes/**: nodalize/denodalize/expand/uncouple logic.
- **groups/**: hierarchy, bounds, gate state & events.
- **lifecycle/**: cleanup and teardown orchestration.
- **utils/**: pure helpers.

## Data Flow Summary
1. User input → UI component → controller.
2. Controller updates state (graph/engine) → runtime as needed.
3. Renderers read state, render UI.

## Safety Guarantees
- Move logic without changing semantics.
- No new dependencies from UI into runtime.
- Provide clear API surfaces between modules.

## References
- Rete.js Editor / Area / Connection separation: https://retejs.org/docs/concepts/editor/
- Rete.js integration (renderer independence): https://retejs.org/docs/concepts/integration/
- Node‑RED editor components: https://nodered.org/docs/user-guide/editor/
