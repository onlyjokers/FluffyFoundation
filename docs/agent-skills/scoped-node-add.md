<!--
Purpose: Describe scoped node.add behavior inside an AI-operable AI Space sandbox.
-->

# command.node-add

## Triggers

- Command types: `node.add`
- Event types: `client.joined`, `client.text.final`

## Summary

Use `node.add` with `scopeGroupId` to create a node inside an AI-operable AI Space sandbox.

## Required Shape

```json
{
  "type": "node.add",
  "scopeGroupId": "ai-space:agent",
  "node": {
    "id": "agent:effect-1",
    "type": "number",
    "position": { "x": 30, "y": 0 },
    "config": {},
    "inputValues": {},
    "outputValues": {}
  }
}
```

## Rules

- `scopeGroupId` must point to an AI Space with enabled `agentPolicy`.
- The AI Space policy must allow `node.add` and `targetScope.allowNewNodes`.
- The command must fit within the AI Space budget, especially `budgets.maxNodes`.
- Successful scoped adds automatically add the new node ID to the AI Space `nodeIds`.
