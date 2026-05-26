// Purpose: Regression coverage for exporting ClientUI nodes into deployed Client patches.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeRegistry, registerDefaultNodeDefinitions } from '@shugu/node-core';
import { exportGraphForPatch } from './patch-export';
import type { GraphState, NodeInstance } from './types';

const node = (id: string, type: string, inputValues: Record<string, unknown> = {}): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues,
  outputValues: {},
});

const registry = new NodeRegistry();
registerDefaultNodeDefinitions(registry, {
  getClientId: () => null,
  getAllClientIds: () => [],
  getSelectedClientIds: () => [],
  executeCommand: () => {},
});

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('exportGraphForPatch includes ClientUI chain nodes when they feed ui-out patch root', () => {
  const graph: GraphState = {
    nodes: [
      node('button', 'client-button', { display: true }),
      node('input', 'client-input-box', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'input', targetPortId: 'in' },
      { id: 'c2', sourceNodeId: 'input', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.type).sort(),
    ['client-button', 'client-input-box', 'ui-out'].sort()
  );
});

test('exportGraphForPatch includes boolean variable setters used by exported getters', () => {
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'setter-fallback', defaultValue: true, mode: 'latchTrue' },
      },
      { ...node('getter', 'get-boolean-variable'), config: { name: 'getter-fallback' } },
      node('button', 'client-button'),
      node('preview', 'show-anything'),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
      { id: 'display', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'button', targetPortId: 'display' },
      { id: 'preview', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'preview', targetPortId: 'in' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.id).sort(),
    ['button', 'getter', 'name', 'out', 'setter'].sort()
  );
  assert.ok(
    result.graph.connections.some(
      (connection) =>
        connection.sourceNodeId === 'name' &&
        connection.sourcePortId === 'value' &&
        connection.targetNodeId === 'setter' &&
        connection.targetPortId === 'name'
    )
  );
});

test('exportGraphForPatch includes Client Button pressed feedback used by exported boolean variable setters', () => {
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'setter-fallback', defaultValue: false, mode: 'latchTrue' },
      },
      { ...node('getter', 'get-boolean-variable'), config: { name: 'getter-fallback' } },
      { ...node('pulse', 'pulse-to-boolean'), config: { mode: 'momentary', defaultValue: false } },
      node('button', 'client-button', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
      { id: 'display', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'button', targetPortId: 'display' },
      { id: 'pressed-pulse', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'pulse', targetPortId: 'pulse' },
      { id: 'pulse-set', sourceNodeId: 'pulse', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'set' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.id).sort(),
    ['button', 'getter', 'name', 'out', 'pulse', 'setter'].sort()
  );
  assert.ok(
    result.graph.connections.some(
      (connection) =>
        connection.sourceNodeId === 'button' &&
        connection.sourcePortId === 'pressed' &&
        connection.targetNodeId === 'pulse' &&
        connection.targetPortId === 'pulse'
    )
  );
  assert.ok(
    result.graph.connections.some(
      (connection) =>
        connection.sourceNodeId === 'pulse' &&
        connection.sourcePortId === 'value' &&
        connection.targetNodeId === 'setter' &&
        connection.targetPortId === 'set'
    )
  );
});

test('exportGraphForPatch includes Client Button pressed feedback even when getter only feeds debug preview', () => {
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'setter-fallback', defaultValue: false, mode: 'latchTrue' },
      },
      { ...node('getter', 'get-boolean-variable'), config: { name: 'getter-fallback' } },
      { ...node('pulse', 'pulse-to-boolean'), config: { mode: 'momentary', defaultValue: false } },
      node('preview', 'show-anything'),
      node('button', 'client-button', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
      { id: 'getter-preview', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'preview', targetPortId: 'in' },
      { id: 'pressed-pulse', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'pulse', targetPortId: 'pulse' },
      { id: 'pulse-set', sourceNodeId: 'pulse', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'set' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.id).sort(),
    ['button', 'name', 'out', 'pulse', 'setter'].sort()
  );
  assert.ok(
    result.graph.connections.some(
      (connection) =>
        connection.sourceNodeId === 'button' &&
        connection.sourcePortId === 'pressed' &&
        connection.targetNodeId === 'pulse' &&
        connection.targetPortId === 'pulse'
    )
  );
});

test('exportGraphForPatch excludes debug-only consumers from Client Button pressed feedback', () => {
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'setter-fallback', defaultValue: false, mode: 'latchTrue' },
      },
      { ...node('pulse', 'pulse-to-boolean'), config: { mode: 'momentary', defaultValue: false } },
      node('pressed-preview', 'show-anything'),
      node('pulse-preview', 'show-anything'),
      node('button', 'client-button', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'pressed-pulse', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'pulse', targetPortId: 'pulse' },
      { id: 'pressed-preview', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'pressed-preview', targetPortId: 'in' },
      { id: 'pulse-set', sourceNodeId: 'pulse', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'set' },
      { id: 'pulse-preview', sourceNodeId: 'pulse', sourcePortId: 'value', targetNodeId: 'pulse-preview', targetPortId: 'in' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.id).sort(),
    ['button', 'name', 'out', 'pulse', 'setter'].sort()
  );
});

test('exported Client Button toggle feedback can hide the button through a boolean variable', async () => {
  let buttonPressed = false;
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'setter-fallback', defaultValue: true, mode: 'latchTrue' },
      },
      { ...node('getter', 'get-boolean-variable'), config: { name: 'getter-fallback' } },
      { ...node('pulse', 'pulse-to-boolean'), config: { mode: 'toggle', defaultValue: true } },
      node('button', 'client-button', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
      { id: 'display', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'button', targetPortId: 'display' },
      { id: 'pressed-pulse', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'pulse', targetPortId: 'pulse' },
      { id: 'pulse-set', sourceNodeId: 'pulse', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'set' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const { NodeRuntime } = await import('@shugu/node-core');
  const { NodeRegistry, registerDefaultNodeDefinitions } = await import('@shugu/node-core');
  const runtimeRegistry = new NodeRegistry();
  registerDefaultNodeDefinitions(runtimeRegistry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: runtimeRegistry });
  assert.equal(result.graph.nodes.find((item) => item.id === 'setter')?.config?.mode, 'followInput');
  const runtime = new NodeRuntime(runtimeRegistry);
  runtimeRegistry.register({
    ...runtimeRegistry.get('client-button')!,
    process: (inputs, _config, context) => {
      const display = inputs.display !== false;
      if (!display) return { out: [], pressed: false };
      const current = buttonPressed;
      buttonPressed = false;
      return { out: [{ type: 'button', nodeId: context.nodeId }], pressed: current };
    },
  });

  try {
    runtime.loadGraph(result.graph);
    runtime.start();
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);

    buttonPressed = true;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);
    await waitFor(() => Array.isArray(runtime.getNode('button')?.outputValues.out));
    assert.deepEqual(runtime.getNode('button')?.outputValues.out, []);
  } finally {
    runtime.stop();
  }
});

test('exported boolean variable client UI patch runs with setter defaults', async () => {
  const graph: GraphState = {
    nodes: [
      node('name', 'string', { value: 'flag' }),
      {
        ...node('setter', 'set-boolean-variable'),
        config: { name: 'flag', defaultValue: true, mode: 'latchTrue' },
      },
      { ...node('getter', 'get-boolean-variable'), config: { name: 'flag' } },
      node('button', 'client-button'),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
      { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
      { id: 'display', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'button', targetPortId: 'display' },
      { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });
  const { NodeRuntime } = await import('@shugu/node-core');
  const runtime = new NodeRuntime(registry);
  runtime.loadGraph(result.graph);
  runtime.step();

  const buttonOut = runtime.getNode('button')?.outputValues.out;
  assert.equal(runtime.getNode('getter')?.outputValues.value, true);
  assert.ok(Array.isArray(buttonOut));
  assert.ok(buttonOut.some((item) => (item as { type?: string }).type === 'button'));
});
