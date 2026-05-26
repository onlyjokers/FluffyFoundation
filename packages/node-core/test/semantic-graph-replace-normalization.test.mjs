// Purpose: verify whole-graph semantic replace normalizes bounded node config.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticCommandBus } from '../dist-node-core/semantic-command-bus.js';

const definitions = [
  {
    type: 'bounded',
    label: 'Bounded',
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
  },
];

test('graph.replace clamps numeric config and normalizes select config before persistence', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'graph.replace',
      graph: {
        nodes: [
          {
            id: 'n1',
            type: 'bounded',
            position: { x: 10, y: 20 },
            config: { value: 999, mode: 'enabled' },
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [],
      partitions: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.command.graph.nodes[0].config, { value: 3, mode: 'on' });
  assert.deepEqual(bus.getSnapshot().nodes[0].params, { value: 3, mode: 'on' });
});

test('graph.replace fills missing config defaults before persistence', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'graph.replace',
      graph: {
        nodes: [
          {
            id: 'n1',
            type: 'bounded',
            position: { x: 10, y: 20 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [],
      partitions: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.command.graph.nodes[0].config, { value: 0, mode: 'off' });
  assert.deepEqual(bus.getSnapshot().nodes[0].params, { value: 0, mode: 'off' });
});

test('node.add fills missing config defaults before persistence', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.add',
      node: {
        id: 'n1',
        type: 'bounded',
        position: { x: 10, y: 20 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.command.node.config, { value: 0, mode: 'off' });
  assert.deepEqual(bus.getSnapshot().nodes[0].params, { value: 0, mode: 'off' });
});

test('graph.replace migrates legacy client button pressed boolean connections through momentary pulse conversion', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions: [
      {
        type: 'client-button',
        label: 'Client Button',
        category: 'ClientUI',
        inputs: [],
        outputs: [{ id: 'pressed', label: 'Pressed', type: 'pulse' }],
        configSchema: [],
      },
      {
        type: 'pulse-to-boolean',
        label: 'Pulse to Boolean',
        category: 'Logic',
        inputs: [{ id: 'pulse', label: 'Pulse', type: 'pulse' }],
        outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
        configSchema: [
          { key: 'mode', label: 'Mode', type: 'select', defaultValue: 'toggle', options: [] },
          { key: 'defaultValue', label: 'Default', type: 'boolean', defaultValue: false },
        ],
      },
      {
        type: 'logic-not',
        label: 'NOT',
        category: 'Logic',
        inputs: [{ id: 'in', label: 'In', type: 'boolean' }],
        outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
        configSchema: [],
      },
    ],
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'graph.replace',
      graph: {
        nodes: [
          { id: 'button', type: 'client-button', position: { x: 10, y: 20 }, config: {}, inputValues: {}, outputValues: {} },
          { id: 'not', type: 'logic-not', position: { x: 220, y: 20 }, config: {}, inputValues: {}, outputValues: {} },
        ],
        connections: [
          {
            id: 'pressed-not',
            sourceNodeId: 'button',
            sourcePortId: 'pressed',
            targetNodeId: 'not',
            targetPortId: 'in',
          },
        ],
      },
      groups: [],
      partitions: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.command.graph.nodes.map((node) => node.type),
    ['client-button', 'logic-not', 'pulse-to-boolean']
  );
  const converter = result.command.graph.nodes.find((node) => node.type === 'pulse-to-boolean');
  assert.deepEqual(converter.config, { mode: 'momentary', defaultValue: false });
  assert.deepEqual(result.command.graph.connections, [
    {
      id: 'pressed-not:pulse',
      sourceNodeId: 'button',
      sourcePortId: 'pressed',
      targetNodeId: converter.id,
      targetPortId: 'pulse',
    },
    {
      id: 'pressed-not',
      sourceNodeId: converter.id,
      sourcePortId: 'value',
      targetNodeId: 'not',
      targetPortId: 'in',
    },
  ]);
});
