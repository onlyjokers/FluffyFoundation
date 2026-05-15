<!--
Purpose: Describe the Display Breathing node skill for AI runtime prompt context.
-->

# node.display-breathing

## Triggers

- Node types: `display-breathing`
- Command types: `node.params.update`
- Event types: `display.ready`, `client.text.final`

## Summary

Controls a Display breathing visual through bounded `intensity` and `breathRate` params.

## Parameters

- `intensity`: number from `0` to `1`; higher values make the visual brighter or more forceful.
- `breathRate`: number from `0.1` to `2`; lower values feel calmer, higher values feel more urgent.

## Command Example

```json
{
  "type": "node.params.update",
  "nodeId": "display:breath",
  "params": {
    "intensity": 0.65,
    "breathRate": 0.8
  }
}
```

## Repair Hints

- If validation reports `GRAPH.PARAM_OUT_OF_RANGE`, clamp the parameter to the documented range.
- If observation reports no visible output change, raise `intensity` slightly or slow `breathRate`.
