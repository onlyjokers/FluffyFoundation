// Purpose: Tests for custom node graph cloning helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '../../../../nodes/types';
import { cloneGraphState } from './custom-node-graph';

test('cloneGraphState clears outputValues and preserves inputs/config', () => {
  const graph: GraphState = {
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 10, y: 20 },
        config: { value: 1 },
        inputValues: { in: 1 },
        outputValues: { out: 1 },
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

  const cloned = cloneGraphState(graph);

  assert.deepEqual(cloned.nodes[0].config, graph.nodes[0].config);
  assert.deepEqual(cloned.nodes[0].inputValues, graph.nodes[0].inputValues);
  assert.deepEqual(cloned.nodes[0].outputValues, {});
  assert.deepEqual(cloned.connections, graph.connections);
});
