<!--
Purpose: Specify the AI Operator architecture, semantic graph context, command API parity, validation, safety, and rollback requirements.
-->

# AI Operator Semantic Contract

## V1 Runtime Contract

The v1 AI Agent runtime is a server-side persistent orchestrator. It is not CLI automation, a Canvas plug-in, or a
chat-only assistant. The orchestrator runs inside the server authority lane, listens to environment events, builds
bounded semantic context, calls the configured OpenAI-compatible model provider, and applies only validated semantic
commands through the shared command bus.

Pi Mono may be used later as a local agent reference or adapter target, but it is not the v1 core runtime. The first
implementation must be self-owned TypeScript code so FluffyFoundation can enforce policy, audit, rollback, redaction,
and shared Canvas/CLI semantic parity without depending on an external agent process.

The AI Agent's environment is the shared semantic layer. Canvas and CLI are human/operator projections over that layer;
AI reads the same semantic truth and writes through the same command contracts.

## Product Claim

AI in FluffyFoundation is a creative Operator with semantic operation capability comparable to a human Manager, constrained
by policy. It is not a chat panel that gives advice while humans do the real work.

The user should be able to say:

- "让这一组 client 的灯光随着陀螺仪旋转变成更紧张的闪烁节奏"
- "把这个 display 的视觉变得更像呼吸"

The AI must inspect real semantic state, plan legal graph operations, execute or propose them through the same command/API used by humans, and observe whether the show output changed.

## What AI Sees

AI receives a compact `SemanticGraphSnapshot`, not Canvas UI noise.

Included:
- Workspace, revision, active Group scope, selected semantic target.
- Node instances with definition ID/version, current params, relevant runtime values, errors, and permissions.
- Connections with port IDs, port types, compatibility, and Group boundary crossing.
- Group boundaries, ownership, public/internal surfaces, transferable flags, current deployments.
- Available Node Registry summaries with input/output ports, param schemas, units, ranges, examples, constraints, risks, side effects, target platforms, and repair hints.
- Device capabilities for target clients/displays.
- Execution partitions, deployment state, watchdog state, and last validation/reporting errors.
- Policy context: what this AI actor may execute, propose, or never do.

Excluded:
- Canvas positions, colors, collapse state, selected pixels, viewport zoom/pan, hover state, UI panel layout.
- Secrets, raw tokens, private local file paths, and irrelevant media metadata.
- Large logs unless summarized by structured error/report objects.

## Node Registry Requirements

Every AI-usable node definition must expose:

- `id`, `version`, `label`, `category`
- `agentSummary`: concise behavior explanation
- `ports`: direction, type, unit, cardinality, compatibility
- `params`: schema, default, min/max, step, enum, unit, mutable flag
- `platforms`: manager, client, display, server, worker
- `sideEffects`: none, visual, audio, media, device, network, storage, authority
- `permissions`: required capabilities and approval class
- `examples`: small graph snippets or command recipes
- `risks`: performance, safety, privacy, show-disruptive behavior
- `repairHints`: common validation errors and suggested fixes
- `migration`: how old instances move to the current definition

Adding a node type without these fields is incomplete even if the UI can render it.

## Command API

AI, Canvas, CLI, and external API call the same command bus:

- `createNode`
- `archiveNode` / `restoreNode`
- `updateNodeParams`
- `connectPorts`
- `disconnectPorts`
- `createGroup`
- `updateGroupSurface`
- `archiveGroup` / `restoreGroup`
- `setGroupOwner` / `offerTransfer` / `reclaim`
- `deployPartition`
- `stopPartition`
- `setRuntimeOverride`
- `clearRuntimeOverride`
- `createProposal`
- `approveProposal`
- `rollbackRevision`

Each command has:
- input schema
- dry-run validation
- policy decision
- idempotency key
- audit record
- history event
- rollback metadata
- structured result and observation hook

## Agent Interfaces

The persistent orchestrator communicates with the semantic layer through explicit, typed interfaces:

- `AgentEnvironmentEvent`: normalized runtime signal such as `client.joined`, `client.text.final`,
  `display.ready`, `semantic.validation.failed`, or `observation.no-output-change`.
- `AgentCommandPlan`: model-authored command plan containing intent, target Group scope, command sequence, expected
  effect, required skills, dry-run result, retry budget, and rollback preference.
- `AgentSkillRef`: compact reference to a progressive-disclosure skill doc, with ID, title, summary, triggers, and
  optional full content only when needed.
- Group `agentInterface`: public inputs, outputs, callable commands, event bindings, and exposed targets that an AI
  actor may reason about.
- Group `agentPolicy`: allowed scope, denied surfaces, command budget, retry budget, approval class, rollback behavior,
  and product-visible side-effect limits.

These interfaces are context and authority boundaries. They do not bypass semantic validation or ControlPlane policy.
The model may draft freely inside the available context, but the command bus decides what can mutate live state.

## FF-18 WP2 In-Memory Execution Core

`@shugu/ai-core` exposes `createAiProposalExecutionCore` as the bounded WP2 API for proposal approval and execution tests. It is dependency-free and accepts an injected semantic command bus, so it does not introduce provider calls, persistence, server endpoints, UI wiring, or Display/Client observation.

The core only evaluates local operation policy, runs dry-run dispatches, applies allowed or approved proposal commands through the command bus, records execution audit/history metadata, and maps AI rollback references back to command-bus rollback tokens.

## FF-18 WP3 In-Memory Observation And Repair Core

`@shugu/ai-core` exposes `createAiObservationEvaluator` and `createAiRepairPlanner` as the bounded WP3 API for structured observation and repair planning tests. These are deterministic, in-memory helpers over WP1 context and WP2 execution results; they do not add provider calls, persistence, server endpoints, UI wiring, Display/Client live observation, or browser runtime hooks.

The evaluator accepts only structured observation reports for output change, validation errors, device capability gaps, no output change, rollback-needed states, and policy denial. Arbitrary console text is not a repair input. The planner uses structured validation codes, paths, command rollback metadata, registry summaries, and repair hints to either draft a bounded proposal command sequence or recommend rollback through the existing WP2 rollback reference.

## AI Operation Flow

1. Interpret natural-language intent and target scope.
2. Request semantic snapshot and registry summaries.
3. Identify desired output change and constraints.
4. Draft a command sequence.
5. Run dry-run validation.
6. If validation fails, repair using structured error reports.
7. Run policy evaluation.
8. If policy allows auto-execution, apply transactionally.
9. If approval is needed, create a proposal with commands, expected effect, risks, and rollback.
10. Observe runtime/output reports after apply.
11. If output did not change or errors appear, repair or roll back according to policy.

## Structured Errors

AI must never parse arbitrary console text as the primary error channel. Validation/reporting errors use structured codes:

- `GRAPH.MISSING_NODE`
- `GRAPH.PORT_INCOMPATIBLE`
- `GRAPH.PARAM_OUT_OF_RANGE`
- `GROUP.BOUNDARY_DENIED`
- `POLICY.PERMISSION_DENIED`
- `DEVICE.CAPABILITY_MISSING`
- `EXECUTION.DEPLOY_FAILED`
- `EXECUTION.NO_OUTPUT_CHANGE`
- `TRANSPORT.DISPLAY_UNREACHABLE`
- `REGISTRY.NODE_UNAVAILABLE`

Each error includes path, actor, scope, severity, human message, machine reason, and repair options.

## Approval Policy

Auto-executable examples:
- Add pure mapping/normalize nodes inside an AI-owned draft Group.
- Adjust bounded numeric params within safe ranges.
- Stop an AI-owned non-show-critical partition.

Approval-required examples:
- Archive human-owned nodes or Groups.
- Change Root-owned published Groups during show mode.
- Enable camera/mic/torch behavior on clients.
- Deploy side-effect partitions to many devices.
- Use paid external AI/provider calls beyond budget.

Always denied examples:
- Read secrets or raw manager keys.
- Bypass ControlPlane scope.
- Mutate Canvas/Rete internals directly.
- Disable audit/history/policy.

## Sandbox Safety Rule

AI may propose, dry-run, retry, and repair freely inside an assigned Group sandbox, but every live mutation still passes
semantic validation, Group `agentPolicy`, actor permissions, audit logging, and rollback metadata creation. Rejected
plans are silent no-ops from the audience's point of view: they must not broadcast partially applied graph changes,
Display output changes, Client pulses, media commands, or authority changes.

## Acceptance Tests

The AI Operator is not accepted until these pass:

- Given a Group with client sensors and flashlight nodes, AI inserts mapping/normalize/timing nodes so gyro rotation affects tense flashlight rhythm.
- Given a Display visual Group, AI changes params or nodes so output visibly breathes.
- Given incompatible ports, AI proposes a valid conversion node or stops with a structured proposal.
- Given missing device capability, AI generates a fallback plan.
- Given policy denial, AI creates a human approval proposal and does not execute.
- Given bad output/no visible change, AI observes failure and repairs or rolls back.
