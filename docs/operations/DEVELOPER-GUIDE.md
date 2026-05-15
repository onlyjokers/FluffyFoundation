<!--
Purpose: FF-24 developer guide for extending nodes, plugins, connectors, validation, tests, and AI descriptions.
-->

# Developer Guide

## Nodes

Add nodes through the registry path used by node-core and Manager specs. A node definition must describe ports, params,
runtime behavior, validation constraints, and user-facing labels. Avoid special-case switches when a registry factory can
own the behavior.

## Plugins

Plugins must declare capabilities, lifecycle expectations, and build/runtime boundaries. Keep plugin code isolated from
Manager UI state and command-bus policy so plugins cannot become god objects.

## Connectors

Connectors move data between nodes, Groups, Clients, Displays, and SDK surfaces. A connector must preserve typed payloads,
scope metadata, and rollback/audit expectations. Do not use ad hoc string payloads when protocol or registry structures
exist.

## Registry

The registry is the source of truth for agent-readable behavior. Registry entries must include IDs, categories, ports,
params, runtime hints, and AI descriptions. Keep generated or built registry outputs in sync with source changes.

## Validation

Validation must run before apply. New node or connector behavior should fail with structured errors that include path,
severity, reason, and repair options. Validation must not weaken scope, policy, audit, rollback, or redaction gates.

## Tests

Use TDD for behavior changes. Add focused tests before production code, confirm RED failure, implement the minimal GREEN
change, then run phase validation. For runtime claims, deterministic tests are not enough; add browser/runtime evidence
when the contract requires it.

## AI Descriptions

AI descriptions should tell the operator what a node or command does, what inputs it needs, what outputs it changes, and
what policy boundaries apply. They must not expose secrets or imply that AI can bypass command-bus validation.

## AI Agent Skills

Add progressive-disclosure skills under `docs/agent-skills/`. Each skill should identify the node or command it teaches,
the trigger conditions, safe parameter ranges, expected surfaces, and repair hints. Keep the summary short enough for the
default prompt and put detailed examples in the skill content so the orchestrator can load it only when needed.

Register runtime skill metadata through `packages/ai-core/src/skill-registry.ts` or the server-side defaults in
`apps/server/src/ai/ai.module.ts`. The orchestrator resolves skills from the current semantic snapshot, event type, and
any model-requested skill IDs before asking the model for an `AgentCommandPlan`.

## AI Agent Runtime

The persistent AI Agent lives on the server in `apps/server/src/ai/ai-orchestrator.service.ts`. Environment events enter
from server routing, such as `client.joined` when a Client connects and `client.text.final` when the Client sends the
`custom` sensor payload `{ kind: "agent-text", text }`. The orchestrator reads a compact semantic snapshot, loads matching
skills, calls the OpenAI-compatible provider, then sends every proposed command through the semantic authority as dry-run
before apply.

Canvas and CLI are operator surfaces over the same semantic layer; they are not separate AI control planes. AI-created
commands must still include the relevant Group scope and obey Group `agentInterface` / `agentPolicy` validation.

## AI Provider Config

Local AI provider config is documented in `docs/harness/AI-AGENT-RUNTIME-CONFIG.md` and loaded from ignored env files.
Use `SHUGU_AI_OPENAI_MODEL`, `SHUGU_AI_OPENAI_BASE_URL`, `SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL`, and
`SHUGU_AI_OPENAI_API_KEY` locally. Never place the real key in tracked docs, tests, fixtures, or harness evidence.
