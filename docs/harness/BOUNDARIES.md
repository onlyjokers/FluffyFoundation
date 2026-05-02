<!--
Purpose: Define module boundaries, ownership lanes, and forbidden coupling for long-term FluffyFoundation development.
-->

# Architecture Boundaries

## Principle

Every layer should have one reason to change. UI renders and captures intent; command/API validates and mutates semantics; runtime executes; transport moves messages; policy decides authority; registry describes available behavior.

## Layers

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| Root UI | authoring workflows, Canvas gestures, Group publishing views | direct graph mutation outside command bus |
| Manager UI | live performance controls for published Groups | heavy graph editor, Rete internals, unauthorized target control |
| Canvas adapter | visual projection, selection, positions, pan/zoom, gesture-to-command translation | business validation, execution, permissions |
| Semantic command bus | graph/Group/partition commands, transactions, history, audit | DOM state, Rete state, transport-specific routing |
| Node Registry | node definitions, versions, schemas, AI summaries, compatibility | per-node global switches, UI-only behavior |
| Graph validation | connection/param/group/deployability checks | applying changes |
| ControlPlane | actor, ownership, transfer, safe mode, policy decisions | rendering, media execution |
| Execution platform | partitions, deploy/start/stop/remove, watchdog, runtime status | authorization bypass |
| Transport | Socket.IO, display local bridge, server fallback, ack/nack | product semantics |
| Plugin host | plugin lifecycle, resource budgets, capability declaration | core graph state mutation |
| AI Operator | planning/proposal/command execution through policy | direct Canvas/Rete mutation or secret access |
| Observability | logs, metrics, traces, reports, evidence | hidden side effects |

## Package Direction

- `@shugu/protocol` is lowest-level shared contract code.
- `@shugu/node-core` may depend on protocol only.
- Future semantic packages should be split by bounded context, for example `@shugu/graph-commands`, `@shugu/node-registry`, `@shugu/control-plane-contracts`, `@shugu/ai-operator-contracts`, and `@shugu/execution-contracts`.
- App packages may depend on contracts and SDKs; contracts must not depend on app packages.
- External app/provider SDKs stay behind adapter packages and never enter core contracts.

## Forbidden Patterns

- Canvas/Rete component directly changing node parameters, connections, Groups, deploy state, or ownership without a command.
- AI reading visual layout fields as primary truth.
- New node types requiring edits to a central switch outside registry registration.
- Control commands without `scopeGroupId` unless explicitly system-scoped.
- Silent transport failure for Display, Client, or NodeExecutor side effects.
- Side-effect nodes without cleanup/disable semantics.
- Hotspot files growing outside an approved split task.
- `@ts-nocheck` added or retained without an owner and removal plan.

## Write Lanes

- Product semantics: `docs/harness/`, `packages/protocol`, future command/contract packages.
- Graph/runtime: `packages/node-core`, future graph-command package, manager/client wrappers only through adapters.
- Server authority: `apps/server/src/events`, `message-router`, `control-plane`, registry/state adapters.
- Root authoring: `apps/manager/src/routes/root`, Canvas adapters, Root-only stores.
- Manager performance: `apps/manager/src/routes/manager`, published Group controls, lightweight stores.
- AI: `packages/ai-core` plus future AI operator package; no direct UI mutation.
