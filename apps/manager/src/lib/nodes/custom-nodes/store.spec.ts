// Purpose: Verify Custom Node registry wiring for the collapsed runtime shell.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerDefaultNodeDefinitions } from '@shugu/node-core';
import { nodeRegistry } from '$lib/nodes/registry';
import {
  customNodeType,
  registerCustomNodeDefinition,
  unregisterCustomNodeDefinition,
} from './store';
import { writeCustomNodeState } from './instance';

registerDefaultNodeDefinitions(nodeRegistry, {
  getClientId: () => null,
  getAllClientIds: () => [],
  getSelectedClientIds: () => [],
  getSensorForClientId: () => null,
  getImageForClientId: () => null,
  executeCommand: () => undefined,
  executeCommandForClientId: () => undefined,
});

test('custom node shell keeps gate port id but shows it as Active', () => {
  const definitionId = 'test-active-label';
  registerCustomNodeDefinition({
    definitionId,
    name: 'Active Label Custom',
    template: { nodes: [], connections: [] },
    ports: [],
  });

  try {
    const def = nodeRegistry.get(customNodeType(definitionId));
    const gate = def?.inputs.find((input) => input.id === 'gate');

    assert.equal(gate?.id, 'gate');
    assert.equal(gate?.label, 'Active');
  } finally {
    unregisterCustomNodeDefinition(definitionId);
  }
});

test('custom node shell passes public inputs through bound group proxies', () => {
  const definitionId = 'test-proxy-input';
  const internal = {
    nodes: [
      {
        id: 'input-proxy',
        type: 'group-proxy',
        position: { x: 0, y: 0 },
        config: { direction: 'input', portType: 'number' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'inner-number',
        type: 'number',
        position: { x: 160, y: 0 },
        config: { value: 0 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'proxy-to-number',
        sourceNodeId: 'input-proxy',
        sourcePortId: 'out',
        targetNodeId: 'inner-number',
        targetPortId: 'value',
      },
    ],
  };

  registerCustomNodeDefinition({
    definitionId,
    name: 'Proxy Input Custom',
    template: internal,
    ports: [
      {
        portKey: 'amount',
        label: 'Amount',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'input-proxy', portId: 'in' },
      },
      {
        portKey: 'out',
        label: 'Out',
        side: 'output',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner-number', portId: 'value' },
      },
    ],
  });

  try {
    const def = nodeRegistry.get(customNodeType(definitionId));
    const config = writeCustomNodeState(
      {},
      {
        definitionId,
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal,
      }
    );

    const outputs = def?.process({ gate: true, amount: 2.69 }, config, {
      nodeId: 'custom-1',
      time: 0,
      deltaTime: 16,
    });

    assert.equal(outputs?.out, 2.69);
  } finally {
    unregisterCustomNodeDefinition(definitionId);
  }
});
