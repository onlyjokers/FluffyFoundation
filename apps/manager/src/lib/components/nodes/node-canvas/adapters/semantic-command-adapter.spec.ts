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
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
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
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
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

test('NodeCanvas semantic commands send node.disconnect payloads through the Manager SDK', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
    }),
  });

  assert.equal(adapter.disconnect('c1'), true);
  assert.deepEqual(sent, [
    {
      requestId: 'canvas:node.disconnect:c1',
      command: {
        kind: 'node.disconnect',
        connectionId: 'c1',
      },
    },
  ]);
});

test('NodeCanvas semantic commands send node.inputs.update payloads through the Manager SDK', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
    }),
  });

  assert.equal(adapter.setNodeInputs('n1', { value: 42 }), true);
  assert.deepEqual(sent, [
    {
      requestId: 'canvas:node.inputs.update:n1',
      command: {
        kind: 'node.inputs.update',
        nodeId: 'n1',
        inputValues: { value: 42 },
      },
    },
  ]);
});

test('NodeCanvas semantic commands send graph.replace payloads for canvas clear', () => {
  const sent: unknown[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
    }),
  });

  assert.equal(adapter.replaceGraph({ nodes: [], connections: [] }), true);
  assert.equal((sent[0] as { requestId?: string }).requestId?.startsWith('canvas:graph.replace:'), true);
  assert.deepEqual((sent[0] as { command?: unknown }).command, {
    kind: 'graph.replace',
    graph: { nodes: [], connections: [] },
  });
});

test('NodeCanvas semantic commands dry-run structural graph commands before SDK send and apply after send', () => {
  const events: string[] = [];
  const localCommands: Array<{ command: SemanticCommand; dryRun: boolean }> = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return true;
      },
    }),
    onLocalCommand: (command, _requestId, options) => {
      events.push(options?.dryRun ? 'local:dry-run' : 'local:apply');
      localCommands.push({ command, dryRun: Boolean(options?.dryRun) });
    },
  });

  assert.equal(adapter.addNode(numberNode), true);
  assert.deepEqual(events, ['local:dry-run', 'send', 'local:apply']);
  assert.deepEqual(localCommands, [
    { command: { type: 'node.add', node: numberNode }, dryRun: true },
    { command: { type: 'node.add', node: numberNode }, dryRun: false },
  ]);

  events.length = 0;
  localCommands.length = 0;

  assert.equal(adapter.disconnect('c1'), true);
  assert.deepEqual(events, ['local:dry-run', 'send', 'local:apply']);
  assert.deepEqual(localCommands, [
    { command: { type: 'node.disconnect', connectionId: 'c1' }, dryRun: true },
    { command: { type: 'node.disconnect', connectionId: 'c1' }, dryRun: false },
  ]);

  events.length = 0;
  localCommands.length = 0;

  assert.equal(adapter.setNodeInputs('n1', { value: 42 }), true);
  assert.deepEqual(events, ['send']);
  assert.deepEqual(localCommands, []);
});

test('NodeCanvas semantic commands do not send structural commands rejected by local validation', () => {
  const events: string[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return true;
      },
    }),
    onPendingCommand: () => events.push('pending'),
    onLocalCommand: (_command, _requestId, options) => {
      events.push(options?.dryRun ? 'local:dry-run' : 'local:apply');
      return false;
    },
  });

  assert.equal(
    adapter.connect({
      id: 'c1',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: 'target',
      targetPortId: 'in',
    }),
    false
  );
  assert.deepEqual(events, ['local:dry-run']);
});

test('NodeCanvas semantic commands can keep manager-only structural commands local', () => {
  const events: string[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return true;
      },
    }),
    onLocalCommand: (_command, _requestId, options) => {
      events.push(options?.dryRun ? 'local:dry-run' : 'local:apply');
      return true;
    },
    isLocalOnlyCommand: (command) =>
      command.type === 'node.connect' &&
      String(command.connection.targetNodeId) === 'group-gate-1',
  });

  assert.equal(
    adapter.connect({
      id: 'c1',
      sourceNodeId: 'bool',
      sourcePortId: 'value',
      targetNodeId: 'group-gate-1',
      targetPortId: 'active',
    }),
    true
  );
  assert.deepEqual(events, ['local:dry-run', 'local:apply']);
});

test('NodeCanvas semantic commands do not locally apply rejected manager-only structural commands', () => {
  const events: string[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return true;
      },
    }),
    onLocalCommand: (_command, _requestId, options) => {
      events.push(options?.dryRun ? 'local:dry-run' : 'local:apply');
      return options?.dryRun ? true : false;
    },
    isLocalOnlyCommand: () => true,
  });

  assert.equal(
    adapter.connect({
      id: 'c1',
      sourceNodeId: 'bool',
      sourcePortId: 'value',
      targetNodeId: 'group-gate-1',
      targetPortId: 'active',
    }),
    false
  );
  assert.deepEqual(events, ['local:dry-run', 'local:apply']);
});

test('NodeCanvas semantic commands do not locally apply structural commands when SDK send fails', () => {
  const events: string[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return false;
      },
    }),
    onError: (message) => events.push(`error:${message}`),
    onPendingCommand: () => events.push('pending'),
    onLocalCommand: (_command, _requestId, options) => {
      events.push(options?.dryRun ? 'local:dry-run' : 'local:apply');
      return true;
    },
  });

  assert.equal(adapter.addNode(numberNode), false);
  assert.deepEqual(events, ['local:dry-run', 'send', 'error:Manager SDK is not connected']);
});

test('NodeCanvas semantic commands track node value commands after SDK send without local replay', () => {
  const events: string[] = [];
  const tracked: Array<{ requestId: string; command: SemanticCommand }> = [];
  const localCommands: SemanticCommand[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => {
        events.push('send');
        return true;
      },
    }),
    onPendingCommand: (command, requestId) => {
      tracked.push({ requestId, command });
    },
    onLocalCommand: (command) => {
      events.push('local');
      localCommands.push(command);
    },
  });

  assert.equal(adapter.setNodeParams('n1', { value: 7 }), true);
  assert.equal(adapter.setNodeInputs('n1', { value: 42 }), true);

  assert.deepEqual(events, ['send', 'send']);
  assert.deepEqual(localCommands, []);
  assert.deepEqual(tracked, [
    {
      requestId: 'canvas:node.params.update:n1',
      command: { type: 'node.params.update', nodeId: 'n1', params: { value: 7 } },
    },
    {
      requestId: 'canvas:node.inputs.update:n1',
      command: { type: 'node.inputs.update', nodeId: 'n1', inputValues: { value: 42 } },
    },
  ]);
});

test('NodeCanvas semantic commands do not track pending commands when SDK send fails', () => {
  const events: string[] = [];
  const adapter = createNodeCanvasSemanticCommands({
    getSDK: () => ({
      sendSemanticCommand: () => false,
    }),
    onError: (message) => events.push(`error:${message}`),
    onPendingCommand: () => events.push('pending'),
    onLocalCommand: () => {
      events.push('local');
      return true;
    },
  });

  assert.equal(adapter.setNodeParams('n1', { value: 7 }), false);
  assert.deepEqual(events, ['error:Manager SDK is not connected']);
});
