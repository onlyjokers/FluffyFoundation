// Purpose: FF-09 Canvas adapter tests proving UI gestures translate to semantic commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSemanticCommandBus, type SemanticCommand } from '@shugu/node-core';
import { createCanvasSemanticCommandAdapter, createNodeCanvasSemanticCommands } from './semantic-command-adapter';
import type { NodeInstance } from '$lib/nodes/types';
import type { NodeDefinition } from '@shugu/node-core';

const definitions: NodeDefinition[] = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
  },
  {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [{ id: 'a', label: 'A', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
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

test('Canvas add/connect adapter dispatches semantic commands without direct graph mutation', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
  });
  const commands: SemanticCommand[] = [];
  const adapter = createCanvasSemanticCommandAdapter({
    commandBus: bus,
    onCommand: (command) => commands.push(command),
  });

  assert.equal(adapter.addNode(numberNode), true);
  assert.deepEqual(
    commands.map((command) => command.type),
    ['node.add']
  );
  assert.equal(bus.getSnapshot().nodes.length, 1);
});

test('Canvas and CLI fixture command path produce the same semantic snapshot', () => {
  const canvasBus = createSemanticCommandBus({
    graph: { nodes: [numberNode], connections: [] },
    definitions,
    revision: 1,
  });
  const cliBus = createSemanticCommandBus({
    graph: { nodes: [numberNode], connections: [] },
    definitions,
    revision: 1,
  });

  const command: SemanticCommand = {
    type: 'node.connect',
    connection: {
      id: 'c1',
      sourceNodeId: 'n1',
      sourcePortId: 'out',
      targetNodeId: 'n2',
      targetPortId: 'a',
    },
  };
  const addMath: SemanticCommand = {
    type: 'node.add',
    node: {
      id: 'n2',
      type: 'math',
      position: { x: 50, y: 50 },
      config: {},
      inputValues: {},
      outputValues: {},
    },
  };

  const canvasAdapter = createCanvasSemanticCommandAdapter({ commandBus: canvasBus });
  assert.equal(canvasAdapter.dispatchForFixture(addMath), true);
  assert.equal(canvasAdapter.dispatchForFixture(command), true);

  assert.equal(
    cliBus.dispatch({ actor: { id: 'cli', role: 'operator' }, command: addMath }).ok,
    true
  );
  assert.equal(cliBus.dispatch({ actor: { id: 'cli', role: 'operator' }, command }).ok, true);

  assert.deepEqual(canvasBus.getSnapshot().nodes, cliBus.getSnapshot().nodes);
  assert.deepEqual(canvasBus.getSnapshot().connections, cliBus.getSnapshot().connections);
});

test('NodeCanvas semantic commands send opaque semantic payloads through the Manager SDK', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => sent.push(input),
    }),
  });

  assert.equal(adapter.addNode(numberNode), true);
  assert.deepEqual(sent, [
    {
      requestId: 'canvas:node.add:n1',
      command: {
        kind: 'node.add',
        node: numberNode,
      },
    },
  ]);
});

test('NodeCanvas semantic commands send node.remove payloads through the Manager SDK', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => sent.push(input),
    }),
  });

  assert.equal(adapter.removeNode('n1'), true);
  assert.deepEqual(sent, [
    {
      requestId: 'canvas:node.remove:n1',
      command: {
        kind: 'node.remove',
        nodeId: 'n1',
      },
    },
  ]);
});

test('NodeCanvas semantic commands send graph.replace payloads for canvas clear', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => sent.push(input),
    }),
  });

  assert.equal(adapter.replaceGraph({ nodes: [], connections: [] }), true);
  assert.equal((sent[0] as { requestId?: string }).requestId?.startsWith('canvas:graph.replace:'), true);
  assert.deepEqual((sent[0] as { command?: unknown }).command, {
    kind: 'graph.replace',
    graph: { nodes: [], connections: [] },
  });
});
