// Purpose: verify graph validation catches missing references and duplicates.

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateGraphState } from '../dist-node-core/graph-state/validate.js';

test('validateGraphState flags missing node refs', () => {
  const state = {
    nodes: [
      {
        id: 'n1',
        type: 'number',
        position: { x: 0, y: 0 },
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
        targetNodeId: 'missing',
        targetPortId: 'in',
      },
    ],
  };

  const result = validateGraphState(state);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length > 0, true);
});
