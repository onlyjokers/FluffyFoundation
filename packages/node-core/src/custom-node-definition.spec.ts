// Purpose: Verify persisted Nodelization definitions become AI-readable custom node definitions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCustomNodeDefinitionNode, customNodeType } from './custom-node-definition.js';
import type { CustomNodeDefinition } from './semantic-graph-types.js';
import type { NodeDefinition } from './types.js';

const numberNode: NodeDefinition = {
  type: 'number-source',
  label: 'Number Source',
  category: 'Values',
  inputs: [
    { id: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 5, defaultValue: 25 },
  ],
  outputs: [
    { id: 'value', label: 'Value', type: 'number', min: 0, max: 100, step: 5, defaultValue: 25 },
  ],
  configSchema: [
    { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 5, defaultValue: 25 },
  ],
  process: () => ({}),
};

const customDefinition: CustomNodeDefinition = {
  definitionId: 'pulse',
  name: 'Pulse',
  template: {
    nodes: [
      {
        id: 'inner-number',
        type: 'number-source',
        position: { x: 0, y: 0 },
        config: { amount: 25 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  },
  ports: [
    {
      portKey: 'value',
      side: 'output',
      label: 'Value',
      type: 'number',
      pinned: true,
      y: 0,
      binding: { nodeId: 'inner-number', portId: 'value' },
    },
    {
      portKey: 'amount',
      side: 'input',
      label: 'Amount',
      type: 'number',
      pinned: true,
      y: 10,
      binding: { nodeId: 'inner-number', portId: 'amount' },
    },
  ],
};

test('customNodeType creates stable custom node type ids', () => {
  assert.equal(customNodeType('pulse'), 'custom:pulse');
});

test('createCustomNodeDefinitionNode infers public port bounds from internal node definitions', () => {
  const node = createCustomNodeDefinitionNode(customDefinition, [numberNode]);

  assert.deepEqual(node.inputs, [
    {
      id: 'amount',
      label: 'Amount',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 25,
    },
  ]);
  assert.deepEqual(node.outputs, [
    {
      id: 'value',
      label: 'Value',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 25,
    },
  ]);
  assert.match(node.metadata?.description ?? '', /wraps 1 internal nodes/);
  assert.match(node.metadata?.description ?? '', /number-source/);
  assert.equal(node.metadata?.examples[0]?.config?.amount, 25);
});
