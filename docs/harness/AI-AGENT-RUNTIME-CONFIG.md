<!--
Purpose: Record the configured AI Agent model provider, endpoint shape, and local environment variables without storing secrets in tracked docs.
-->

# AI Agent Runtime Config

## Current Provider Choice

- Provider protocol: OpenAI-compatible chat completions.
- Model: `GPT5.5-low`.
- Base URL: `https://code.b886.top/v1`.
- Chat completions endpoint: `POST https://code.b886.top/v1/chat/completions`.

## Local Environment Variables

The real API key must stay in ignored local env files only. Do not write it into tracked docs, harness evidence, tests,
or committed config.

Expected local variables:

```env
SHUGU_AI_PROVIDER=openai-compatible
SHUGU_AI_OPENAI_MODEL=GPT5.5-low
SHUGU_AI_OPENAI_BASE_URL=https://code.b886.top/v1
SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL=https://code.b886.top/v1/chat/completions
SHUGU_AI_OPENAI_API_KEY=<local secret>
```

## Agent Stack Notes

- The v1 AI Agent runtime is a server-side persistent orchestrator that calls the shared semantic command layer directly,
  not a CLI-driven automation loop.
- CLI remains a debugging, replay, and operator automation surface over the same semantic layer.
- Runtime ingress starts with server environment events. `client.joined` is emitted when a Client connects, and
  `client.text.final` is emitted from Client `custom` sensor payloads shaped as `{ kind: "agent-text", text }`.
- Node and Group knowledge should be exposed through agent-readable node metadata plus progressive-disclosure docs or
  skills, so the model can request only the specific node guidance it needs.
- Pi Mono may be inspected locally at `/Users/ziqi/Desktop/pi` as a future reference or adapter candidate. It is not the
  v1 core runtime.
- The orchestrator consumes `AgentEnvironmentEvent` input, produces `AgentCommandPlan` output, references
  `AgentSkillRef` docs, and obeys Group `agentInterface` / `agentPolicy` boundaries before any live command is applied.
