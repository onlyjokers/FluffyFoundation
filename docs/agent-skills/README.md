<!--
Purpose: Explain how AI Agent skill docs are structured and progressively loaded into runtime context.
-->

# Agent Skills

Agent skills are concise, model-readable docs that explain how to use node types, semantic commands, and event inputs.
They are context, not authority: the semantic command bus still validates scope, policy, budgets, and rollback.

## Progressive Disclosure

The orchestrator should load skill summaries by default. Full skill content is loaded only when the current event,
command plan, or repair loop needs that exact skill.

Each skill should declare:

- `id`: stable skill ID, such as `node.display-breathing` or `command.node-add`.
- `triggers`: node types, command types, or event types that make the skill relevant.
- `summary`: one or two compact sentences for the default prompt.
- `content`: full guidance with params, valid ranges, examples, risks, and repair hints.

## Runtime Rule

Skill text cannot grant permission. AI may use a skill to draft better commands, but live mutations must still pass
AI Space `agentPolicy`, semantic validation, audit, and rollback.
