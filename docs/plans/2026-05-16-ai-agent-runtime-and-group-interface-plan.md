# AI Agent Runtime and Group Interface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a persistent AI Agent runtime that listens to environment events, loads skill docs progressively, and drives Manager/Client/Display through the shared semantic command bus.

**Architecture:** Use a server-side orchestrator that owns model calls, event ingestion, skill retrieval, and command execution. Keep Canvas and CLI as alternate entry surfaces to the same semantic layer. Treat Group as an AI-operable sandbox with explicit interface and policy metadata, not as an unconstrained mutation zone.

**Tech Stack:** TypeScript, SvelteKit/NestJS app code, `@shugu/node-core` semantic bus, `@shugu/ai-core` helpers, OpenAI-compatible Chat Completions, JSON Schema structured outputs, local skill/docs registry, env-based config.

### Task 1: Lock the AI runtime contract

**Files:**
- Modify: `docs/harness/AI-OPERATOR.md`
- Modify: `docs/harness/BOUNDARIES.md`
- Modify: `docs/harness/AI-AGENT-RUNTIME-CONFIG.md`

**Step 1: Write the contract update**

Document that v1 uses a server-side persistent orchestrator, not CLI automation, and that Pi Mono is optional later rather than the core runtime.

**Step 2: Add interface boundaries**

Describe `AgentEnvironmentEvent`, `AgentCommandPlan`, `AgentSkillRef`, and Group-level `agentInterface` / `agentPolicy` fields.

**Step 3: Define the safety rule**

State that AI may propose and retry freely inside its sandbox, but all live mutations still pass semantic validation, policy, and rollback.

### Task 2: Add model provider config and client

**Files:**
- Modify: `apps/server/src/bootstrap/load-env.ts`
- Modify: `packages/ai-core/src/types.ts`
- Modify: `packages/ai-core/src/factory.ts`
- Create: `packages/ai-core/src/openai-compatible-client.ts`
- Create: `packages/ai-core/test/openai-compatible-client.test.mjs`

**Step 1: Write the failing test**

Verify the client builds the correct `POST /v1/chat/completions` request, sends `GPT5.5-low`, and never logs the secret key.

**Step 2: Run the test to confirm failure**

Use the local test runner for the new file and confirm the client does not exist yet.

**Step 3: Implement the client**

Use an OpenAI-compatible request body with structured JSON output; keep a fallback parser for plain JSON when schema mode is unavailable.

**Step 4: Run the test to confirm pass**

Confirm request shape, timeout behavior, and redaction behavior.

### Task 3: Make Group an AI-operable sandbox

**Files:**
- Modify: `packages/node-core/src/semantic-graph-types.ts`
- Modify: `packages/node-core/src/semantic-command-runtime-validation.ts`
- Modify: `packages/node-core/src/semantic-command-bus.ts`
- Modify: `packages/node-core/src/semantic-command-mutations.ts`
- Create: `packages/node-core/test/agent-group-policy.test.mjs`

**Step 1: Write the failing test**

Assert that a Group with `agentInterface` / `agentPolicy` can allow internal graph edits while rejecting out-of-scope targets.

**Step 2: Implement minimal type additions**

Add typed public inputs, outputs, target scope, and policy metadata to `SemanticGroup`.

**Step 3: Enforce policy**

Reject commands that escape the assigned Group, exceed budgets, or touch denied surfaces.

**Step 4: Verify rollback and no-op behavior**

Rejected AI attempts must not change live state or broadcast product-visible changes.

### Task 4: Add skill-based progressive disclosure

**Files:**
- Create: `docs/agent-skills/README.md`
- Create: `docs/agent-skills/<node-or-command>.md`
- Create: `packages/ai-core/src/skill-registry.ts`
- Create: `packages/ai-core/test/skill-registry.test.mjs`

**Step 1: Write the failing test**

Ensure the orchestrator can fetch only the skill docs needed for the current node/command/event.

**Step 2: Implement skill selection**

Resolve skills by node type, command type, and event type; keep the prompt compact by default.

**Step 3: Add progressive disclosure rules**

Load summaries first, then the node-specific skill only when the model needs it.

### Task 5: Build the persistent AI orchestrator

**Files:**
- Create: `apps/server/src/ai/ai-orchestrator.service.ts`
- Create: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Create: `apps/server/src/ai/ai-orchestrator.service.spec.ts`

**Step 1: Write the failing test**

Simulate `client.joined` and `client.text.final` events and assert the orchestrator emits semantic commands through the bus.

**Step 2: Wire event ingestion**

Subscribe to server-side environment events and build a per-session AI context from semantic snapshots plus skill docs.

**Step 3: Add the turn loop**

Run model -> validate -> dry-run -> apply -> observe -> repair / rollback.

**Step 4: Preserve silence on failure**

If a plan is rejected, the orchestrator retries or no-ops without disturbing the audience-facing runtime.

### Task 6: Add the first demo loop

**Files:**
- Modify: `apps/client/src/routes/+page.svelte`
- Modify: `apps/server/src/message-router/message-router.service.ts`
- Create: `apps/server/src/ai/agent-demo.spec.ts`

**Step 1: Write the failing test**

Model the first scenario: user joins, AI greets on Display, Client pulses, user types text, AI continues the exchange.

**Step 2: Implement the text input event**

Use a simple client text box as the v1 stand-in for speech input.

**Step 3: Validate output change**

Check that greeting, pulse, and response commands are routed through the shared semantic layer.

### Task 7: Verify, document, and keep the config local

**Files:**
- Modify: `docs/harness/AI-AGENT-RUNTIME-CONFIG.md`
- Modify: `docs/operations/DEVELOPER-GUIDE.md`
- Add/keep local only: `.env`

**Step 1: Run tests**

Run the new AI-core and server tests plus any touched semantic bus tests.

**Step 2: Confirm env handling**

Verify that the repo reads the AI config from ignored local env files and that no secret appears in tracked docs.

**Step 3: Update developer guidance**

Explain how to add node skills, how the orchestrator consumes them, and where the OpenAI-compatible provider config lives.

**Assumptions**

- v1 uses a self-owned orchestrator plus OpenAI-compatible chat completions, not Pi Mono as the primary runtime.
- Skill docs are progressive-disclosure context, not authority; they help the model, but the semantic bus still decides.
- Client text input is the first speech substitute; ASR can come later.
- The API key stays only in ignored local env files, never in tracked docs or tests.
