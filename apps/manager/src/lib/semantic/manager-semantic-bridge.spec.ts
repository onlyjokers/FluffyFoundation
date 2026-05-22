// Purpose: Verify the Manager semantic bridge is the shared Canvas/CLI graph mutation path.
import assert from 'node:assert/strict';
import { writable } from 'svelte/store';
import { test } from 'node:test';

import { createManagerSemanticBridge, type ManagerSemanticBridgeRuntime } from './manager-semantic-bridge';
import type { Connection, NodeInstance } from '$lib/nodes/types';
import { NodeRegistry, type NodeDefinition } from '@shugu/node-core';

const definitions: NodeDefinition[] = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({}),
  },
  {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [{ id: 'a', label: 'A', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [{ key: 'gain', type: 'number', label: 'Gain', defaultValue: 1 }],
    process: () => ({}),
  },
];

const numberNode: NodeInstance = {
  id: 'n1',
  type: 'number',
  position: { x: 10, y: 20 },
  config: {},
  inputValues: {},
  outputValues: {},
};

function createRuntime() {
  const nodes: NodeInstance[] = [];
  const connections: Connection[] = [];
  const configPatches: Array<{ nodeId: string; patch: Record<string, unknown> }> = [];
  const inputValuePatches: Array<{ nodeId: string; portId: string; value: unknown }> = [];

  const registry = new NodeRegistry();
  for (const definition of definitions) registry.register(definition);

  const runtime: ManagerSemanticBridgeRuntime = {
    nodeEngine: {
      exportGraph: () => ({ nodes: nodes.map((node) => ({ ...node })), connections: connections.map((conn) => ({ ...conn })) }),
      addNode: (node: NodeInstance) => {
        nodes.push({ ...node });
      },
      addConnection: (connection: Connection) => {
        connections.push({ ...connection });
      },
      removeConnection: (connectionId: string) => {
        const index = connections.findIndex((candidate) => candidate.id === connectionId);
        if (index >= 0) connections.splice(index, 1);
      },
      updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => {
        configPatches.push({ nodeId, patch });
        const node = nodes.find((candidate) => candidate.id === nodeId);
        if (node) node.config = { ...(node.config ?? {}), ...patch };
      },
      updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => {
        inputValuePatches.push({ nodeId, portId, value });
        const node = nodes.find((candidate) => candidate.id === nodeId);
        if (node) node.inputValues = { ...(node.inputValues ?? {}), [portId]: value };
      },
      removeNode: (nodeId: string) => {
        const index = nodes.findIndex((candidate) => candidate.id === nodeId);
        if (index >= 0) nodes.splice(index, 1);
      },
      replaceNodeInputValues: (nodeId: string, inputValues: Record<string, unknown>) => {
        const node = nodes.find((candidate) => candidate.id === nodeId);
        if (node) node.inputValues = { ...inputValues };
      },
      lastError: writable<string | null>(null),
    },
    nodeRegistry: registry,
    getGroups: () => [],
    getPartitions: () => [],
    isRunningStore: writable(false),
    lastErrorStore: writable<string | null>(null),
  };

  return { runtime, nodes, connections, configPatches, inputValuePatches };
}

test('Manager semantic bridge gives Canvas and CLI-style commands the same graph mutation path', () => {
  const canvas = createRuntime();
  const cli = createRuntime();
  const canvasBridge = createManagerSemanticBridge(canvas.runtime);
  const cliBridge = createManagerSemanticBridge(cli.runtime);

  const mathNode: NodeInstance = {
    id: 'n2',
    type: 'math',
    position: { x: 50, y: 50 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  assert.equal(canvasBridge.addNode(numberNode).ok, true);
  assert.equal(canvasBridge.addNode(mathNode).ok, true);
  assert.equal(
    canvasBridge.connect({
      id: 'c1',
      sourceNodeId: 'n1',
      sourcePortId: 'out',
      targetNodeId: 'n2',
      targetPortId: 'a',
    }).ok,
    true
  );

  assert.equal(cliBridge.dispatch({ actor: { id: 'cli', role: 'operator' }, command: { type: 'node.add', node: numberNode } }).ok, true);
  assert.equal(cliBridge.dispatch({ actor: { id: 'cli', role: 'operator' }, command: { type: 'node.add', node: mathNode } }).ok, true);
  assert.equal(
    cliBridge.dispatch({
      actor: { id: 'cli', role: 'operator' },
      command: {
        type: 'node.connect',
        connection: {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePortId: 'out',
          targetNodeId: 'n2',
          targetPortId: 'a',
        },
      },
    }).ok,
    true
  );

  assert.deepEqual(canvas.nodes, cli.nodes);
  assert.deepEqual(canvas.connections, cli.connections);
});

test('Manager semantic bridge applies node.params.update through nodeEngine.updateNodeConfig', () => {
  const { runtime, configPatches, nodes } = createRuntime();
  const bridge = createManagerSemanticBridge(runtime);

  assert.equal(bridge.addNode({ ...numberNode, id: 'n-param', type: 'math' }).ok, true);
  const result = bridge.setNodeParams('n-param', { gain: 2 });

  assert.equal(result.ok, true);
  assert.deepEqual(configPatches, [{ nodeId: 'n-param', patch: { gain: 2 } }]);
  assert.deepEqual(nodes[0]?.config, { gain: 2 });
});

test('Manager semantic bridge applies node.inputs.update through nodeEngine.updateNodeInputValue', () => {
  const { runtime, inputValuePatches, nodes } = createRuntime();
  const bridge = createManagerSemanticBridge(runtime);

  assert.equal(bridge.addNode({ ...numberNode, id: 'n-input', type: 'math' }).ok, true);
  const result = bridge.setNodeInputs('n-input', { a: 5 });

  assert.equal(result.ok, true);
  assert.deepEqual(inputValuePatches, [{ nodeId: 'n-input', portId: 'a', value: 5 }]);
  assert.deepEqual(nodes[0]?.inputValues, { a: 5 });
});

test('Manager semantic bridge applies node.remove through nodeEngine.removeNode', () => {
  const { runtime, nodes } = createRuntime();
  const bridge = createManagerSemanticBridge(runtime);

  assert.equal(bridge.addNode(numberNode).ok, true);
  const result = bridge.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: { type: 'node.remove', nodeId: 'n1' },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(nodes, []);
});

test('Manager semantic bridge applies node.disconnect through nodeEngine.removeConnection', () => {
  const { runtime, connections } = createRuntime();
  const bridge = createManagerSemanticBridge(runtime);
  const mathNode: NodeInstance = {
    id: 'n2',
    type: 'math',
    position: { x: 50, y: 50 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  assert.equal(bridge.addNode(numberNode).ok, true);
  assert.equal(bridge.addNode(mathNode).ok, true);
  assert.equal(
    bridge.connect({
      id: 'c1',
      sourceNodeId: 'n1',
      sourcePortId: 'out',
      targetNodeId: 'n2',
      targetPortId: 'a',
    }).ok,
    true
  );
  const result = bridge.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: { type: 'node.disconnect', connectionId: 'c1' },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(connections, []);
});
