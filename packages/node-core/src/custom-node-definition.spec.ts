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

const customDefinitionWithAiNotes: CustomNodeDefinition = {
  ...customDefinition,
  definitionId: 'guided-pulse',
  name: 'Guided Pulse',
  template: {
    nodes: [
      ...customDefinition.template.nodes,
      {
        id: 'ai-description',
        type: 'ai-note',
        position: { x: 40, y: 0 },
        config: { kind: 'description', text: 'Use this node when a client click should dismiss a shared UI.' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'ai-compatibility',
        type: 'ai-note',
        position: { x: 40, y: 80 },
        config: { kind: 'compatibility', text: 'Works with Client Button Pressed pulses and boolean variable gates.' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'ai-example',
        type: 'ai-note',
        position: { x: 40, y: 160 },
        config: { kind: 'examples', text: 'Connect Pressed to the public trigger input.' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'ai-repair',
        type: 'ai-note',
        position: { x: 40, y: 240 },
        config: { kind: 'repairHints', text: 'Check the variable name if downstream visibility does not change.' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'ai-empty',
        type: 'ai-note',
        position: { x: 40, y: 320 },
        config: { kind: 'description', text: '   ' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  },
};

test('customNodeType creates stable custom node type ids', () => {
  assert.equal(customNodeType('pulse'), 'custom:pulse');
});

test('createCustomNodeDefinitionNode exposes Active gate plus inferred public port bounds', () => {
  const node = createCustomNodeDefinitionNode(customDefinition, [numberNode]);

  assert.deepEqual(node.inputs, [
    {
      id: 'gate',
      label: 'Active',
      type: 'boolean',
      defaultValue: true,
    },
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

test('createCustomNodeDefinitionNode folds AI Note nodes into agent metadata hints', () => {
  const node = createCustomNodeDefinitionNode(customDefinitionWithAiNotes, [numberNode]);

  assert.match(node.metadata?.description ?? '', /Use this node when a client click should dismiss a shared UI/);
  assert.equal(
    node.metadata?.compatibility.some(
      (rule) =>
        rule.target === 'custom-node-manual' &&
        rule.rule === 'Works with Client Button Pressed pulses and boolean variable gates.'
    ),
    true
  );
  assert.equal(
    node.metadata?.examples.some(
      (example) =>
        example.title === 'Guided Pulse AI note example' &&
        example.summary === 'Connect Pressed to the public trigger input.'
    ),
    true
  );
  assert.equal(
    node.metadata?.repairHints?.includes('Check the variable name if downstream visibility does not change.'),
    true
  );
  assert.doesNotMatch(node.metadata?.description ?? '', /\s{3,}/);
});
