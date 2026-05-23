import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, NodeRuntime, registerDefaultNodeDefinitions } from '../dist-node-core/index.js';

function nodeInstance(id, type, overrides = {}) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
    ...overrides,
  };
}

function withFakeNow(t, initialNow = 0) {
  const realNow = Date.now;
  let now = initialNow;
  Date.now = () => now;
  t.after(() => {
    Date.now = realNow;
  });
  return {
    setNow: (next) => {
      now = next;
    },
    getNow: () => now,
  };
}

test('compile orders nodes topologically', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    // Intentionally shuffled.
    nodes: [nodeInstance('b', 'pass'), nodeInstance('a', 'const')],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'a',
        sourcePortId: 'out',
        targetNodeId: 'b',
        targetPortId: 'in',
      },
    ],
  });

  runtime.compileNow();
  const order = runtime.executionOrder.map((n) => n.id);
  assert.deepEqual(order, ['a', 'b']);
});

test('loadGraph drops connections to unknown ports', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'a',
    label: 'A',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });
  registry.register({
    type: 'b',
    label: 'B',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [nodeInstance('n1', 'a'), nodeInstance('n2', 'b')],
    connections: [
      { id: 'ok', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in' },
      { id: 'bad-src', sourceNodeId: 'n1', sourcePortId: 'missing', targetNodeId: 'n2', targetPortId: 'in' },
      { id: 'bad-dst', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'missing' },
    ],
  });

  const graph = runtime.getGraphRef();
  assert.equal(graph.connections.length, 1);
  assert.equal(graph.connections[0].id, 'ok');
});

test('compile detects cycles on non-sink edges', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [nodeInstance('a', 'pass'), nodeInstance('b', 'pass')],
    connections: [
      { id: 'ab', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
      { id: 'ba', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
    ],
  });

  assert.throws(() => runtime.compileNow(), /Cycle detected/i);
});

test('compile allows multiple edges between the same nodes', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: () => ({ out: true }),
  });
  registry.register({
    type: 'dual',
    label: 'Dual',
    category: 'Test',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: Boolean(inputs.a) && Boolean(inputs.b) }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [nodeInstance('src', 'const'), nodeInstance('tgt', 'dual')],
    connections: [
      { id: 'c1', sourceNodeId: 'src', sourcePortId: 'out', targetNodeId: 'tgt', targetPortId: 'a' },
      { id: 'c2', sourceNodeId: 'src', sourcePortId: 'out', targetNodeId: 'tgt', targetPortId: 'b' },
    ],
  });

  runtime.compileNow();
  const order = runtime.executionOrder.map((n) => n.id);
  assert.deepEqual(order, ['src', 'tgt']);
});

test('compile allows sink edges in feedback loops', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'producer',
    label: 'Producer',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number', kind: 'sink' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
    onSink: () => {},
  });
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [nodeInstance('a', 'pass'), nodeInstance('b', 'producer')],
    connections: [
      // Non-sink dependency: b -> a
      { id: 'ba', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
      // Sink feedback edge (ignored for compile): a -> b
      { id: 'ab', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
    ],
  });

  runtime.compileNow();
  const order = runtime.executionOrder.map((n) => n.id);
  assert.deepEqual(order, ['b', 'a']);
});

test('disabled nodes with matching in/out act as a wire', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry, {
    isNodeEnabled: (nodeId) => nodeId !== 'b',
  });

  runtime.loadGraph({
    nodes: [nodeInstance('a', 'const'), nodeInstance('b', 'pass'), nodeInstance('c', 'pass')],
    connections: [
      { id: 'ab', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
      { id: 'bc', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in' },
    ],
  });
  runtime.compileNow();

  runtime.tick();
  assert.equal(runtime.getNode('b').outputValues.out, 1);
  assert.equal(runtime.getNode('c').outputValues.out, 1);
});

test('client-loader applies index, range, and random to loaded client ids', () => {
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
  assert.equal(selected.client.clientId, 'client-b');
  assert.deepEqual(selected.client.clientIds, ['client-b', 'client-c']);

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
  assert.equal(selectedWithCachedClientId.client.clientId, 'client-c');

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

  assert.equal(randomA.indexs.length, 2);
  assert.equal(randomB.indexs.length, 2);
  assert.notDeepEqual(randomA.indexs, randomB.indexs);
  assert.ok(randomA.indexs.every((clientId) => ['client-a', 'client-b', 'client-c'].includes(clientId)));
  assert.ok(randomB.indexs.every((clientId) => ['client-a', 'client-b', 'client-c'].includes(clientId)));
});

test('client-loader load all bypasses index, range, random, and loaded subsets', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c', 'client-d'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const loader = registry.get('client-loader');
  assert.ok(loader);

  const selected = loader.process(
    {
      loadAll: true,
      loadIndexs: ['client-b'],
      index: 3,
      range: 1,
      random: true,
    },
    {},
    { nodeId: 'loader-load-all', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(selected.indexs, ['client-a', 'client-b', 'client-c', 'client-d']);
  assert.equal(selected.number, 4);
  assert.equal(selected.client.clientId, 'client-a');
  assert.deepEqual(selected.client.clientIds, ['client-a', 'client-b', 'client-c', 'client-d']);
});

test('client-permission-filter narrows a client collection and outputs rejected ids', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c', 'client-d'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) =>
      ({
        'client-a': { microphone: 'granted', camera: 'granted' },
        'client-b': { microphone: 'denied', camera: 'granted' },
        'client-c': { microphone: 'granted', camera: 'denied' },
        'client-d': { microphone: 'granted', camera: 'granted' },
      })[clientId] ?? null,
    executeCommand: () => {},
  });
  const filter = registry.get('client-permission-filter');
  assert.ok(filter);

  const selected = filter.process(
    {
      client: { clientId: 'client-b', clientIds: ['client-b', 'client-c', 'client-d'] },
    },
    { matchMode: 'all', microphone: true, camera: true },
    { nodeId: 'permission-filter', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(selected.indexs, ['client-d']);
  assert.equal(selected.number, 1);
  assert.deepEqual(selected.rejectedIndexs, ['client-b', 'client-c']);
  assert.equal(selected.client.clientId, 'client-d');
  assert.deepEqual(selected.client.clientIds, ['client-d']);
});

test('client-permission-filter treats missing requirements as pass-through client collection', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    getClientPermissions: () => null,
    executeCommand: () => {},
  });
  const filter = registry.get('client-permission-filter');
  assert.ok(filter);

  const selected = filter.process(
    { client: { clientId: 'client-b', clientIds: ['client-b'] } },
    { matchMode: 'all' },
    { nodeId: 'permission-filter-pass', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(selected.indexs, ['client-b']);
  assert.equal(selected.client.clientId, 'client-b');
  assert.deepEqual(selected.client.clientIds, ['client-b']);
  assert.deepEqual(selected.rejectedIndexs, []);
});

test('input override TTL expires and restores base values', (t) => {
  const clock = withFakeNow(t, 0);

  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [nodeInstance('a', 'const'), nodeInstance('b', 'pass')],
    connections: [
      { id: 'c1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
    ],
  });
  runtime.compileNow();

  runtime.tick();
  assert.equal(runtime.getNode('b').outputValues.out, 1);

  runtime.applyOverride('b', 'input', 'in', 42, 100);

  clock.setNow(0);
  runtime.tick();
  assert.equal(runtime.getNode('b').outputValues.out, 42);

  clock.setNow(50);
  runtime.tick();
  assert.equal(runtime.getNode('b').outputValues.out, 42);

  clock.setNow(150);
  runtime.tick();
  assert.equal(runtime.getNode('b').outputValues.out, 1);
});

test('watchdog triggers on sink burst', (t) => {
  const clock = withFakeNow(t, 0);

  const registry = new NodeRegistry();
  registry.register({
    type: 'prod',
    label: 'Prod',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'command' }],
    configSchema: [],
    process: () => ({ out: { action: 'flashlight', payload: { mode: 'on' } } }),
  });
  registry.register({
    type: 'sink',
    label: 'Sink',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'command', kind: 'sink' }],
    outputs: [],
    configSchema: [],
    process: () => ({}),
    onSink: () => {},
  });

  let info = null;
  const runtime = new NodeRuntime(registry, {
    watchdog: { maxSinkValuesPerTick: 1 },
    onWatchdog: (next) => {
      info = next;
    },
  });

  runtime.loadGraph({
    nodes: [nodeInstance('p1', 'prod'), nodeInstance('p2', 'prod'), nodeInstance('s', 'sink')],
    connections: [
      { id: 'c1', sourceNodeId: 'p1', sourcePortId: 'out', targetNodeId: 's', targetPortId: 'in' },
      { id: 'c2', sourceNodeId: 'p2', sourcePortId: 'out', targetNodeId: 's', targetPortId: 'in' },
    ],
  });
  runtime.compileNow();

  clock.setNow(0);
  runtime.tick();

  assert.ok(info, 'expected watchdog to trigger');
  assert.equal(info.reason, 'sink-burst');
});

test('watchdog triggers on oscillation (alternating sink signatures)', (t) => {
  const clock = withFakeNow(t, 0);

  const registry = new NodeRegistry();
  registry.register({
    type: 'toggle',
    label: 'Toggle',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'command' }],
    configSchema: [],
    process: (_inputs, _config, context) => {
      const on = Math.floor(context.time / 10) % 2 === 0;
      return { out: { action: 'flashlight', payload: { mode: on ? 'on' : 'off' } } };
    },
  });
  registry.register({
    type: 'sink',
    label: 'Sink',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'command', kind: 'sink' }],
    outputs: [],
    configSchema: [],
    process: () => ({}),
    onSink: () => {},
  });

  let info = null;
  const runtime = new NodeRuntime(registry, {
    watchdog: {
      oscillation: {
        enabled: true,
        windowSize: 4,
        minAlternatingLength: 4,
        windowMs: 1000,
      },
    },
    onWatchdog: (next) => {
      info = next;
    },
  });

  runtime.loadGraph({
    nodes: [nodeInstance('t', 'toggle'), nodeInstance('s', 'sink')],
    connections: [
      { id: 'c1', sourceNodeId: 't', sourcePortId: 'out', targetNodeId: 's', targetPortId: 'in' },
    ],
  });
  runtime.compileNow();

  for (const now of [0, 10, 20, 30]) {
    clock.setNow(now);
    runtime.tick();
    if (info) break;
  }

  assert.ok(info, 'expected watchdog to trigger');
  assert.equal(info.reason, 'oscillation');
});
