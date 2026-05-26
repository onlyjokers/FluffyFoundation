// Purpose: Verify Manager node engine keeps node config within definition bounds.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';

import type { NodeDefinition } from '@shugu/node-core';
import { nodeEngine } from './engine';
import { addCustomNodeDefinition, removeCustomNodeDefinition } from './custom-nodes/store';
import { writeCustomNodeState } from './custom-nodes/instance';
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

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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

test('manager watchdog warnings do not stop the running show', async () => {
  nodeRegistry.register({
    type: 'test-pass-cycle',
    label: 'Test Pass Cycle',
    category: 'Values',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  try {
    nodeEngine.lastError.set(null);
    nodeEngine.loadGraph({
      nodes: [
        {
          id: 'a',
          type: 'test-pass-cycle',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'b',
          type: 'test-pass-cycle',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
        { id: 'c2', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
      ],
    });

    nodeEngine.start();
    await waitFor(() => String(get(nodeEngine.lastError)).includes('Cycle detected'));

    assert.equal(get(nodeEngine.isRunning), true);
    assert.match(String(get(nodeEngine.lastError)), /Cycle detected/i);
  } finally {
    nodeEngine.stop();
    nodeEngine.isRunning.set(false);
    nodeEngine.loadGraph({ nodes: [], connections: [] });
    nodeEngine.lastError.set(null);
    nodeRegistry.unregister('test-pass-cycle');
  }
});

test('patch export uses connected runtime gate values for Custom Node Active', async () => {
  const definitionId = 'test-connected-gate';
  const registeredTypes: string[] = [];
  const registerIfMissing = (definition: NodeDefinition) => {
    if (nodeRegistry.get(definition.type)) return;
    nodeRegistry.register(definition);
    registeredTypes.push(definition.type);
  };
  registerIfMissing({
    type: 'bool',
    label: 'Bool',
    category: 'Test',
    inputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [],
    process: (inputs, config) => ({
      value: typeof inputs.value === 'boolean' ? inputs.value : Boolean(config.value),
    }),
  });
  registerIfMissing({
    type: 'scene-box',
    label: 'Scene Box',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: () => ({ out: [{ type: 'box' }] }),
  });
  registerIfMissing({
    type: 'scene-out',
    label: 'Scene Out',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'scene', kind: 'sink' }],
    outputs: [{ id: 'cmd', label: 'Deploy', type: 'command' }],
    configSchema: [],
    process: () => ({}),
  });
  addCustomNodeDefinition({
    definitionId,
    name: 'Connected Gate Custom',
    template: {
      nodes: [
        {
          id: 'inner-scene',
          type: 'scene-box',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inner-out',
          type: 'scene-out',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'inner-scene-out',
          sourceNodeId: 'inner-scene',
          sourcePortId: 'out',
          targetNodeId: 'inner-out',
          targetPortId: 'in',
        },
      ],
    },
    ports: [],
  });

  try {
    nodeEngine.loadGraph({
      nodes: [
        {
          id: 'gate-source',
          type: 'bool',
          position: { x: 0, y: 0 },
          config: { value: false },
          inputValues: { value: false },
          outputValues: {},
        },
        {
          id: 'custom-1',
          type: `custom:${definitionId}`,
          position: { x: 0, y: 0 },
          config: writeCustomNodeState(
            {},
            {
              definitionId,
              groupId: 'group-1',
              role: 'mother',
              manualGate: true,
              internal: {
                nodes: [
                  {
                    id: 'inner-scene',
                    type: 'scene-box',
                    position: { x: 0, y: 0 },
                    config: {},
                    inputValues: {},
                    outputValues: {},
                  },
                  {
                    id: 'inner-out',
                    type: 'scene-out',
                    position: { x: 0, y: 0 },
                    config: {},
                    inputValues: {},
                    outputValues: {},
                  },
                ],
                connections: [
                  {
                    id: 'inner-scene-out',
                    sourceNodeId: 'inner-scene',
                    sourcePortId: 'out',
                    targetNodeId: 'inner-out',
                    targetPortId: 'in',
                  },
                ],
              },
            }
          ),
          inputValues: { gate: true },
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'gate-to-custom',
          sourceNodeId: 'gate-source',
          sourcePortId: 'value',
          targetNodeId: 'custom-1',
          targetPortId: 'gate',
        },
      ],
    });

    nodeEngine.start();
    await waitFor(() => nodeEngine.getLastComputedInputs('custom-1')?.gate === false);

    const compiled = nodeEngine.exportCompiledGraphForPatchPlanning();
    assert.deepEqual(compiled.nodes.map((node) => String(node.id)), ['gate-source']);
    assert.deepEqual(compiled.connections, []);
  } finally {
    nodeEngine.stop();
    nodeEngine.isRunning.set(false);
    nodeEngine.loadGraph({ nodes: [], connections: [] });
    removeCustomNodeDefinition(definitionId);
    for (const type of registeredTypes) nodeRegistry.unregister(type);
  }
});
