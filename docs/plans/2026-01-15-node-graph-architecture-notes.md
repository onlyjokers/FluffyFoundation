# NodeCanvas Responsibility Map (Worktree)

> Purpose: Locate major responsibilities in NodeCanvas so we can move logic without changing behavior.

## High‑Level Sections (approx line anchors)

1) **Composition Root / Wiring**
- Imports and module wiring: ~1–120
- Core stores, sockets, state caches: ~120–220

2) **Controllers Init**
- Group controller init: ~231
- Loop controller init: ~255
- Patch runtime init: ~375

3) **Custom Nodes Domain**
- Custom node action wiring: ~598 (init), ~794 (actions binding)

4) **Rete Setup**
- Rete render preset: ~1694
- Graph sync: ~1702
- Rete pipes: ~1851

5) **Group & Custom Node Events**
- Group event binding: ~1866
- Custom node event binding: ~1878

6) **Project/Group persistence & sync**
- Group persistence: ~1458

7) **Runtime Signals**
- Display bridge + patch reconcile triggers: ~1841–1842

8) **Interaction UX**
- Group proxy drag: ~2088
- Alt/Option duplicate drag: ~2225

## Notes
- Use these anchors to extract logic into domain modules without changing behavior.
- NodeCanvas should retain only the wiring for these components once extracted.
