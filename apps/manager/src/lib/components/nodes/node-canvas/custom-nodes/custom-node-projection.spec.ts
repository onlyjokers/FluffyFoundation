// Purpose: Verify editor-only Custom Node projection graphs stay distinct from canonical graph ids.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import { buildCustomNodeProjectionGraph, isCustomNodeProjectionId } from './custom-node-projection';

test('buildCustomNodeProjectionGraph creates view-prefixed nodes and connections', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: {
      nodes: [
        {
          id: 'inner-a',
          type: 'number',
          position: { x: 10, y: 20 },
          config: { value: 1 },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inner-b',
          type: 'number',
          position: { x: 30, y: 40 },
          config: { value: 2 },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'inner-c',
          sourceNodeId: 'inner-a',
          sourcePortId: 'value',
          targetNodeId: 'inner-b',
          targetPortId: 'value',
        },
      ],
    },
    ports: [],
  };
  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group-1',
    role: 'mother',
    manualGate: true,
    internal: definition.template,
  };

  const projection = buildCustomNodeProjectionGraph({ customNode, state, definition });

  assert.equal(projection.nodes.length, 2);
  assert.ok(projection.nodes.every((node) => isCustomNodeProjectionId(String(node.id))));
  assert.equal(projection.nodes[0].position.x, 110);
  assert.equal(projection.nodes[0].position.y, 220);
  assert.deepEqual(projection.nodes[0].config.editorProjection, true);
  assert.equal(projection.connections.length, 1);
  assert.ok(isCustomNodeProjectionId(String(projection.connections[0].sourceNodeId)));
  assert.ok(isCustomNodeProjectionId(String(projection.connections[0].targetNodeId)));
});
