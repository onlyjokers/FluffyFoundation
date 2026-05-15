<!--
Purpose: Describe scoped node.add behavior inside an AI-operable Group sandbox.
-->

# command.node-add

## Triggers

- Command types: `node.add`
- Event types: `client.joined`, `client.text.final`

## Summary

Use `node.add` with `scopeGroupId` to create a node inside an AI-operable Group sandbox.

## Required Shape

```json
{
  "type": "node.add",
  "scopeGroupId": "group:agent",
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

- `scopeGroupId` must point to a Group with enabled `agentPolicy`.
- The Group policy must allow `node.add` and `targetScope.allowNewNodes`.
- The command must fit within the Group budget, especially `budgets.maxNodes`.
- Successful scoped adds automatically add the new node ID to the Group `nodeIds`.
