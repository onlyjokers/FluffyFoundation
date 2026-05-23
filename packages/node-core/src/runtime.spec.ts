// Purpose: Regression coverage for NodeRuntime graph execution semantics.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerDefaultNodeDefinitions } from './definitions/register.js';
import { NodeRegistry } from './registry.js';
import { NodeRuntime } from './runtime.js';
import type { GraphState } from './types.js';
import type { NodeCommand } from './definitions/types.js';
import { createSemanticCommandBus } from './semantic-command-bus.js';

const createCommandRuntime = (commands: Array<{ clientId: string; cmd: NodeCommand }>) => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });
  return new NodeRuntime(registry);
};

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const payloadFrequency = (cmd: NodeCommand): number | undefined =>
  (cmd.payload as { frequency?: number } | undefined)?.frequency;

test('input value changes retrigger command sink effects', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const runtime = createCommandRuntime(commands);
  const graph: GraphState = {
    nodes: [
      {
        id: 'synth',
        type: 'proc-synth-update',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {
          active: true,
          waveform: 'square',
          frequency: 440,
          volume: 0.7,
          modDepth: 0,
          modFrequency: 12,
          durationMs: 200,
        },
        outputValues: {},
      },
      {
        id: 'agg',
        type: 'cmd-aggregator',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-a' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'agg',
        targetPortId: 'in1',
      },
      {
        id: 'c2',
        sourceNodeId: 'agg',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'c3',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  };

  runtime.loadGraph(graph);
  runtime.start();
  await waitFor(() => commands.some((entry) => payloadFrequency(entry.cmd) === 440));

  const synth = runtime.getNode('synth');
  assert.ok(synth);
  synth.inputValues.frequency = 880;
  await waitFor(() => commands.some((entry) => payloadFrequency(entry.cmd) === 880));
  runtime.stop();

  assert.equal(commands[0].clientId, 'client-a');
  assert.equal(commands[0].cmd.action, 'modulateSoundUpdate');
  assert.equal(payloadFrequency(commands[0].cmd), 440);
  const updated = commands.find((entry) => payloadFrequency(entry.cmd) === 880);
  assert.ok(updated);
  assert.equal(updated.clientId, 'client-a');
  assert.equal(updated.cmd.action, 'modulateSoundUpdate');
});

test('client loader selects client collections and executor routes command sink effects', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'synth',
        type: 'proc-synth-update',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { active: true, frequency: 440, volume: 0.7, waveform: 'square', durationMs: 200 },
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 1, range: 2, random: false },
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'c2',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  });

  runtime.start();
  const loader = runtime.getNode('loader');
  assert.ok(loader);
  await waitFor(
    () =>
      Array.isArray(loader.outputValues.indexs) &&
      (loader.outputValues.indexs as string[]).length === 2 &&
      commands.some((entry) => entry.clientId === 'client-a') &&
      commands.some((entry) => entry.clientId === 'client-b')
  );
  const loaderOutput = { ...loader.outputValues };
  runtime.stop();

  assert.deepEqual(new Set(commands.map((entry) => entry.clientId)), new Set(['client-a', 'client-b']));
  assert.deepEqual(loaderOutput.indexs, ['client-a', 'client-b']);
  assert.equal(loaderOutput.number, 2);
  assert.deepEqual((loaderOutput.client as { clientIds?: string[] }).clientIds, ['client-a', 'client-b']);
});

test('client UI nodes expose interaction state through runtime dependencies', () => {
  let buttonPressed = true;
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    clientUi: {
      consumeClientButtonPressed: (nodeId) => {
        assert.equal(nodeId, 'button');
        const current = buttonPressed;
        buttonPressed = false;
        return current;
      },
      getClientUiState: (nodeId) => {
        assert.equal(nodeId, 'input');
        return {
          displayed: true,
          kind: 'input',
          pressed: false,
          inputContent: 'hello',
          firstInputed: true,
        };
      },
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'input',
        type: 'client-input-box',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { display: true },
        outputValues: {},
      },
      {
        id: 'button',
        type: 'client-button',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { display: true },
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'input',
        sourcePortId: 'out',
        targetNodeId: 'button',
        targetPortId: 'in',
      },
    ],
  });

  runtime.step();

  assert.equal(runtime.getNode('input')?.outputValues.inputContent, 'hello');
  assert.equal(runtime.getNode('input')?.outputValues.firstInputed, true);
  assert.equal(runtime.getNode('button')?.outputValues.pressed, true);

  runtime.step();

  assert.equal(runtime.getNode('button')?.outputValues.pressed, false);
});

test('client loader applies index range and random to loaded client ids', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c', 'client-d'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const loader = registry.get('client-loader');
  assert.ok(loader);

  const context = { nodeId: 'loader-loaded-subset', time: 0, deltaTime: 0 };
  const selected = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 2,
      range: 2,
      random: false,
    },
    {},
    context
  );

  assert.deepEqual(selected.indexs, ['client-b', 'client-c']);
  assert.equal(selected.number, 2);
  assert.equal((selected.client as { clientId?: string }).clientId, 'client-b');
  assert.deepEqual((selected.client as { clientIds?: string[] }).clientIds, ['client-b', 'client-c']);

  const selectedWithCachedClientId = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 3,
      range: 1,
      random: false,
    },
    { clientId: 'client-a' },
    context
  );

  assert.deepEqual(selectedWithCachedClientId.indexs, ['client-c']);
  assert.equal((selectedWithCachedClientId.client as { clientId?: string }).clientId, 'client-c');

  const randomA = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 1,
      range: 2,
      random: true,
    },
    {},
    { ...context, nodeId: 'loader-random-subset' }
  );
  const randomB = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 2,
      range: 2,
      random: true,
    },
    {},
    { ...context, nodeId: 'loader-random-subset' }
  );

  assert.equal((randomA.indexs as string[]).length, 2);
  assert.equal((randomB.indexs as string[]).length, 2);
  assert.notDeepEqual(randomA.indexs, randomB.indexs);
  assert.ok((randomA.indexs as string[]).every((clientId) => ['client-a', 'client-b', 'client-c'].includes(clientId)));
  assert.ok((randomB.indexs as string[]).every((clientId) => ['client-a', 'client-b', 'client-c'].includes(clientId)));
});

test('default registry replaces legacy client-object with loader and executor nodes', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  assert.equal(registry.get('client-object'), undefined);
  assert.equal(registry.get('client-loader')?.label, 'Client Loader');
  assert.equal(registry.get('client-executor')?.label, 'Client Executor');
});

test('default registry exposes int, float, and display-object for server semantic authority', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const display = registry.get('display-object');
  const intNode = registry.get('int');
  const floatNode = registry.get('float');

  assert.equal(display?.label, 'Display');
  assert.equal(display?.metadata?.platformTargets.includes('display'), true);
  assert.equal(display?.inputs.some((input) => input.id === 'in' && input.type === 'command'), true);
  assert.equal(display?.configSchema.some((field) => field.key === 'displayId'), true);
  assert.equal(registry.get('number'), undefined);
  assert.equal(intNode?.label, 'Int');
  assert.equal(intNode?.configSchema.find((field) => field.key === 'value')?.step, 1);
  assert.equal(floatNode?.label, 'Float');
  assert.equal(floatNode?.configSchema.find((field) => field.key === 'value')?.step, 0.01);
});

test('client permission filter supports all and any permission matching', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'display-1'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) => {
      if (clientId === 'client-a') return { microphone: 'granted', motion: 'granted' };
      if (clientId === 'client-b') return { microphone: 'granted', motion: 'denied' };
      return { microphone: 'granted', motion: 'granted' };
    },
    isAudienceClient: (clientId) => clientId !== 'display-1',
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.process({}, { microphone: true, motion: true, matchMode: 'all' }, { nodeId: 'filter', time: 0, deltaTime: 0 }),
    {
      client: { clientId: 'client-a', clientIds: ['client-a'], sensors: null },
      indexs: ['client-a'],
      number: 1,
      rejectedIndexs: ['client-b'],
    }
  );
  assert.deepEqual(
    node.process({}, { microphone: true, motion: true, matchMode: 'any' }, { nodeId: 'filter', time: 0, deltaTime: 0 }),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
});

test('client permission filter pass-throughs empty requirements and filters client input collections', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) =>
      clientId === 'client-b' ? { camera: 'granted' } : { camera: 'pending' },
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.process(
      { client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'] } },
      { camera: true, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-b', clientIds: ['client-b'], sensors: null },
      indexs: ['client-b'],
      number: 1,
      rejectedIndexs: ['client-a'],
    }
  );
  assert.deepEqual(
    node.process(
      { client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'] } },
      { matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
});

test('client permission filter supports boolean inputs overriding permission config toggles', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) =>
      clientId === 'client-b' ? { camera: 'granted' } : { camera: 'denied' },
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.inputs
      .filter((input) => input.type === 'boolean')
      .map((input) => input.id)
      .sort(),
    ['camera', 'geolocation', 'microphone', 'motion', 'wakeLock'].sort()
  );
  assert.deepEqual(
    node.process(
      { camera: false },
      { camera: true, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
  assert.deepEqual(
    node.process(
      { camera: true },
      { camera: false, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-b', clientIds: ['client-b'], sensors: null },
      indexs: ['client-b'],
      number: 1,
      rejectedIndexs: ['client-a'],
    }
  );
});

test('semantic command normalization migrates legacy number source nodes to float', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions: registry.list(),
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    revision: 0,
  });

  const added = bus.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: {
      type: 'node.add',
      node: {
        id: 'legacy-number',
        type: 'number',
        position: { x: 0, y: 0 },
        config: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    },
  });

  assert.equal(added.ok, true);
  assert.equal(added.command.type, 'node.add');
  assert.equal(added.command.type === 'node.add' ? added.command.node.type : null, 'float');
  assert.equal(bus.getSnapshot().nodes[0]?.type, 'float');
});
