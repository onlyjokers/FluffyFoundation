// Purpose: tests for structural graph change detection.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from './types';
import { diffGraphState } from './graph-changes';

test('diffGraphState emits add/remove/update changes', () => {
  const prev: GraphState = {
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 0, y: 0 },
        config: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  const next: GraphState = {
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 10, y: 20 },
        config: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'n2',
        type: 'number',
        position: { x: 1, y: 1 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePortId: 'out',
        targetNodeId: 'n2',
        targetPortId: 'in',
      },
    ],
  };

  const changes = diffGraphState(prev, next);
  const types = new Set(changes.map((change) => change.type));

  assert.ok(types.has('add-node'));
  assert.ok(types.has('update-node-position'));
  assert.ok(types.has('update-node-config'));
  assert.ok(types.has('add-connection'));
});
