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
