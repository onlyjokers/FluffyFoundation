<!--
Purpose: Define module boundaries, ownership lanes, and forbidden coupling for long-term FluffyFoundation development.
-->

# Architecture Boundaries

## Principle

Every layer should have one reason to change. UI renders and captures intent; command/API validates and mutates semantics; runtime executes; transport moves messages; policy decides authority; registry describes available behavior.

Acceptance contracts under `.harness/goals/` and [ACCEPTANCE.md](ACCEPTANCE.md) may narrow scope or require more proof.
They must not weaken the architecture, security, policy, audit, rollback, redaction, dependency, or hotspot boundaries in
this file.

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
| AI Operator | server-side event ingestion, model calls, progressive skill loading, planning/proposal/command execution through policy | direct Canvas/Rete mutation, CLI shell control as primary runtime, or secret access |
| Observability | logs, metrics, traces, reports, evidence | hidden side effects |

## Package Direction

- `@shugu/protocol` is lowest-level shared contract code.
- `@shugu/node-core` may depend on protocol only.
- Future semantic packages should be split by bounded context, for example `@shugu/graph-commands`, `@shugu/node-registry`, `@shugu/control-plane-contracts`, `@shugu/ai-operator-contracts`, and `@shugu/execution-contracts`.
- App packages may depend on contracts and SDKs; contracts must not depend on app packages.
- External app/provider SDKs stay behind adapter packages and never enter core contracts.
- Package and app imports must use declared public package exports. Deep imports such as
  `@shugu/sdk-client/src/client-sdk` are blocked by `pnpm guard:deps` unless a package exposes that subpath in
  `package.json`.

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

## AI Runtime Boundary

The v1 AI Agent runtime belongs to the server authority lane. It listens to normalized `AgentEnvironmentEvent` values,
uses `@shugu/ai-core` for provider/client/context helpers, and sends `AgentCommandPlan` commands to the semantic command
bus. It must not drive Canvas, Client, Display, or CLI as a hidden UI automation surface.

Group-level AI access is explicit:

- `agentInterface` describes the sandbox surface the model may understand and call: public inputs, outputs, events,
  commands, and target IDs.
- `agentPolicy` describes enforcement: target scope, denied surfaces, command/retry budgets, approval class, and
  rollback/no-op behavior.

These fields are declarative metadata. Enforcement remains in semantic validation, command bus policy, and rollback.

## Topology Change Policy

Every new source file must start with a short purpose header that states the file's role. The header may be a block
comment in TypeScript/Svelte, an HTML comment in Markdown/Svelte markup, or the closest repo-native comment form.

Every new workspace package must have a package-level purpose in `package.json` and must be listed in the topology
policy before code depends on it. The policy entry must name its lane, allowed upstream packages, and CODEOWNERS lane.

Topology changes require an ADR or harness policy update before implementation when they do any of the following:

- add a new app or package;
- add a new public package export;
- add a new cross-package dependency or reverse an existing dependency direction;
- move ownership between Root, Manager, Display, SDK, server, plugin, AI, persistence, topology, protocol, or runtime
  lanes;
- expand a hotspot allowance instead of splitting or shrinking it.

FF-02 guard ownership:

- `pnpm harness:hotspots` blocks growth in allowlisted large files and blocks unlisted files at or above 400 lines.
- `pnpm guard:deps` blocks unexported deep imports, undeclared package dependencies, package-to-app imports, and
  disallowed lane dependencies for Root, Manager, Display, SDK, server, plugin, AI, persistence, topology, protocol,
  and runtime paths.
- Root `CODEOWNERS` declares placeholder local handles for architecture, security, AI, server, UI, protocol, runtime,
  and release ownership. These handles must be replaced with real GitHub teams before repository protection relies on
  CODEOWNERS enforcement.
