# Node Graph Decoupling Design

## Goal
Maintain identical user experience while progressively decoupling Node Graph concerns across manager, client, and display. Prevent future monolithic growth by enforcing strict boundaries between graph state, runtime execution, and transport/UI.

## Recommended Approach (Gradual, Cross-App)
**Approach A: Shared Graph Core + App Adapters**
- Expand `packages/node-core` to own graph state, change sets, validation, and runtime interfaces.
- Manager/Client/Display become adapter layers that consume the shared core.
- Transport becomes its own adapter (socket/postMessage/SDK) and only carries graph messages.

This minimizes risk, avoids large-bang rewrites, and guarantees cross-app consistency without changing UX.

## Module Boundaries
### Shared Core (packages/node-core)
- **Graph types** (data-only): Node, Port, Connection, Group, GraphState, ChangeSet.
- **Graph state**: creation, mutation, validation, diff/patch (pure functions).
- **Runtime interface**: execution scheduling and hooks, no DOM dependency.
- **I/O**: serialization, versioned migrations, input validation.

### Manager Adapter (apps/manager)
- **UI adapter**: Svelte/Rete components; renders graph state only.
- **Interaction controller**: translates UI gestures into graph actions.
- **Renderer mapping**: node/connection/control view registry only.

### Client/Display Adapter (apps/client, apps/display)
- **Runtime adapter**: executes graph state using node-core runtime interface.
- **Side-effects**: audio/visual sinks (unchanged behavior), but isolated from graph mutations.

### Transport Adapter (shared pattern)
- Socket/postMessage/SDK wiring that only handles graph commands + change sets.

## Data Flow
- UI produces **Graph Actions** → node-core mutates GraphState (pure) → ChangeSet emitted.
- Manager UI consumes ChangeSet for rendering. Client/Display consumes ChangeSet for runtime execution.
- Transport only carries GraphState/ChangeSet and metadata, not UI or runtime logic.

## Migration Strategy (Gradual)
1. **Extract graph state + change sets** into node-core without behavior changes.
2. **Route manager mutations** through node-core graph actions, remove direct state mutation in UI.
3. **Move runtime wiring** into dedicated runtime adapters for client/display.
4. **Isolate transport** into adapter modules per app; unify message shapes.
5. **Tighten tests** to lock behavior.

## Testing Strategy
- Unit tests in node-core for graph actions, validation, and change set correctness.
- Adapter tests for manager interaction (minimal UI integration tests).
- Runtime tests for client/display execution equivalence vs current behavior.
- Regression checklist for Node Graph UX unchanged.

## Compatibility Constraints
- No visible UI/UX changes.
- All existing graph features (grouping, nodalize/denodalize, collapsed sockets, gate) remain intact.
- Backward-compatible serialization for existing project saves.
