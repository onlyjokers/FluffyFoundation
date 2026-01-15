// Purpose: verify graph change application keeps node/connection state consistent.

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyGraphChanges } from '../dist-node-core/graph-state/changes.js';

const base = { nodes: [], connections: [] };

test('applyGraphChanges adds and removes nodes + connections', () => {
  const next = applyGraphChanges(base, [
    {
      type: 'add-node',
      node: {
        id: 'n1',
        type: 'number',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    },
    {
      type: 'add-node',
      node: {
        id: 'n2',
        type: 'number',
        position: { x: 1, y: 1 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    },
    {
      type: 'add-connection',
      connection: {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePortId: 'out',
        targetNodeId: 'n2',
        targetPortId: 'in',
      },
    },
    { type: 'remove-connection', connectionId: 'c1' },
    { type: 'remove-node', nodeId: 'n2' },
  ]);

  assert.equal(next.nodes.length, 1);
  assert.equal(next.connections.length, 0);
});
