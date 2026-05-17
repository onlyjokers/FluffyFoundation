// Purpose: Verify Manager node engine keeps node config within definition bounds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeDefinition } from '@shugu/node-core';
import { nodeEngine } from './engine';
import { nodeRegistry } from './registry';

const type = 'test-bounded-config';

const definition: NodeDefinition = {
  type,
  label: 'Test Bounded Config',
  category: 'Values',
  inputs: [],
  outputs: [],
  configSchema: [
    { key: 'value', label: 'Value', type: 'number', defaultValue: 0, min: 0, max: 3 },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      defaultValue: 'off',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ],
    },
  ],
  process: () => ({}),
};

test('nodeEngine clamps config on loadGraph and updateNodeConfig', () => {
  nodeRegistry.register(definition);
  try {
    nodeEngine.loadGraph({
      nodes: [
        {
          id: 'bounded',
          type,
          position: { x: 0, y: 0 },
          config: { value: 999, mode: 'enabled' },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    });

    assert.deepEqual(nodeEngine.exportGraph().nodes[0]?.config, { value: 3, mode: 'on' });

    nodeEngine.updateNodeConfig('bounded', { value: -5, mode: 'disabled' });
    assert.deepEqual(nodeEngine.exportGraph().nodes[0]?.config, { value: 0, mode: 'off' });
  } finally {
    nodeEngine.loadGraph({ nodes: [], connections: [] });
    nodeRegistry.unregister(type);
  }
});
