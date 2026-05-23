// Purpose: Verify Custom Node expanded projection frames use real rendered node bounds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import { buildCustomNodeProjectionFrame } from './custom-node-projection-frame';

test('buildCustomNodeProjectionFrame wraps every projected node using adapter bounds', () => {
  const projection: GraphState = {
    nodes: [
      {
        id: 'view:custom:custom-1:track',
        type: 'scene-fct-track',
        position: { x: 100, y: 100 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'view:custom:custom-1:client',
        type: 'client-loader',
        position: { x: 560, y: 130 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  const boundsByNodeId = new Map<string, NodeBounds>([
    ['view:custom:custom-1:track', { left: 100, top: 100, right: 370, bottom: 740 }],
    ['view:custom:custom-1:client', { left: 560, top: 130, right: 850, bottom: 680 }],
  ]);

  const frame = buildCustomNodeProjectionFrame({
    ownerId: 'custom-1',
    groupId: 'group-1',
    name: 'Group 1',
    disabled: false,
    projection,
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(
    frame && { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    { left: 48, top: 36, width: 854, height: 756 }
  );
});
