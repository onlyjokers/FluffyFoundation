// Purpose: Regression tests for manager patch runtime node-executor transport.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readable, writable } from 'svelte/store';

import { createPatchRuntime } from './patch-runtime';
import type {
  CreatePatchRuntimeOptions,
  DisplayTransportAvailabilityLike,
  PatchPayload,
} from './patch-runtime-types';
import type { GraphState, NodeDefinition, NodeInstance, NodePort } from '$lib/nodes/types';

const node = (id: string, type: string): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

const port = (id: string, type: NodePort['type']): NodePort => ({ id, label: id, type });

const definition = (
  type: string,
  label: string,
  inputs: NodePort[],
  outputs: NodePort[]
): NodeDefinition => ({
  type,
  label,
  category: 'Test',
  inputs,
  outputs,
  configSchema: [],
  process: () => ({}),
});

const defaultAvailability = (): DisplayTransportAvailabilityLike => ({
  route: 'server',
  hasLocalSession: false,
  hasLocalReady: false,
  hasRemoteDisplay: false,
});

const basePayload = (): PatchPayload => ({
  graph: { nodes: [node('scene', 'scene-fct-track'), node('out', 'scene-out')], connections: [] },
  meta: {
    loopId: 'patch:scene-out:out:fct',
    requiredCapabilities: ['visual'],
    tickIntervalMs: 33,
    protocolVersion: '1',
    executorVersion: 'node-executor-v1',
  },
  assetRefs: [],
});

function createHarness() {
  const graph: GraphState = {
    nodes: [node('scene', 'scene-fct-track'), node('out', 'scene-out'), node('client', 'client-object')],
    connections: [{ id: 'cmd', sourceNodeId: 'out', sourcePortId: 'cmd', targetNodeId: 'client', targetPortId: 'in' }],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('in', 'scene')], [port('out', 'scene')])],
    ['client-object', definition('client-object', 'Client', [port('in', 'command')], [port('out', 'client')])],
  ]);
  const visualStates = new Map<string, Record<string, unknown>>();
  const payload = basePayload();
  const availability: DisplayTransportAvailabilityLike = {
    route: 'server',
    hasLocalSession: false,
    hasLocalReady: false,
    hasRemoteDisplay: false,
  };

  const opts: CreatePatchRuntimeOptions = {
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: Object.assign(writable<string | null>(null), { set: () => undefined }),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: (nodeId: string) => visualStates.get(nodeId) ?? {},
      setNodeVisualState: async (nodeId: string, state: Record<string, unknown>) => {
        visualStates.set(nodeId, { ...(visualStates.get(nodeId) ?? {}), ...state });
      },
    } as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [{ clientId: 'client-1', group: 'audience', connected: true }],
      selectedClientIds: ['client-1'],
    }),
    displayTransport: {
      getAvailability: () => availability,
      sendPlugin: () => availability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  };

  return { runtime: createPatchRuntime(opts), sent };
}

function createImmediateHarness() {
  let graph: GraphState = {
    nodes: [node('scene', 'scene-fct-track'), node('out', 'scene-out'), node('client', 'client-object')],
    connections: [{ id: 'cmd', sourceNodeId: 'out', sourcePortId: 'cmd', targetNodeId: 'client', targetPortId: 'in' }],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('in', 'scene')], [port('out', 'scene')])],
    ['client-object', definition('client-object', 'Client', [port('in', 'command')], [port('out', 'client')])],
  ]);
  const payload = basePayload();

  const opts: CreatePatchRuntimeOptions = {
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [{ clientId: 'client-1', group: 'audience', connected: true }],
      selectedClientIds: ['client-1'],
    }),
    displayTransport: {
      getAvailability: defaultAvailability,
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  };

  return {
    runtime: createPatchRuntime(opts),
    sent,
    setGraph: (nextGraph: GraphState) => {
      graph = nextGraph;
    },
  };
}

test('patch runtime targets node-executor commands at the managed client group', async () => {
  const { runtime, sent } = createHarness();

  runtime.scheduleReconcile('test');
  await new Promise((resolve) => setTimeout(resolve, 360));

  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].target, { mode: 'group', groupId: 'client:client-1' });
  assert.equal(sent[0].pluginName, 'node-executor');
  assert.equal(sent[0].command, 'deploy');
  assert.deepEqual(sent[1].target, { mode: 'group', groupId: 'client:client-1' });
  assert.equal(sent[1].command, 'start');

  runtime.destroy();
});

test('patch runtime deploys a compiled custom-node patch from a collapsed editor graph', () => {
  const { runtime, sent, setGraph } = createImmediateHarness();

  const compiledGraph: GraphState = {
    nodes: [
      node('cn:custom-1:scene', 'scene-fct-track'),
      node('cn:custom-1:out', 'scene-out'),
      node('cn:custom-1:client', 'client-object'),
    ],
    connections: [
      {
        id: 'compiled-cmd',
        sourceNodeId: 'cn:custom-1:out',
        sourcePortId: 'cmd',
        targetNodeId: 'cn:custom-1:client',
        targetPortId: 'in',
      },
    ],
  };

  setGraph({
    nodes: [node('custom-1', 'custom:def-1')],
    connections: [],
  });

  runtime.destroy();

  const sentFromCompiled: typeof sent = [];
  const definitions = new Map<string, NodeDefinition>([
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('in', 'scene')], [port('out', 'scene')])],
    ['client-object', definition('client-object', 'Client', [port('in', 'command')], [port('out', 'client')])],
  ]);
  const collapsedGraph: GraphState = {
    nodes: [node('custom-1', 'custom:def-1')],
    connections: [],
  };
  const payload = basePayload();
  payload.graph = {
    nodes: compiledGraph.nodes,
    connections: compiledGraph.connections,
  };
  payload.meta.loopId = 'patch:scene-out:cn:custom-1:out:compiled';

  const compiledRuntime = createPatchRuntime({
    nodeEngine: {
      getNode: (nodeId) => collapsedGraph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportCompiledGraphForPatchPlanning: () => compiledGraph,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => collapsedGraph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [{ clientId: 'client-1', group: 'audience', connected: true }],
      selectedClientIds: ['client-1'],
    }),
    displayTransport: {
      getAvailability: defaultAvailability,
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sentFromCompiled.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  });

  compiledRuntime.scheduleReconcile('compiled-custom-node', { immediate: true });

  assert.deepEqual(sentFromCompiled.map((message) => message.command), ['deploy', 'start']);
  assert.deepEqual(sentFromCompiled[0]?.target, { mode: 'group', groupId: 'client:client-1' });
  compiledRuntime.destroy();
});

test('patch runtime does not redeploy when graph changes keep the same topology', () => {
  const { runtime, sent, setGraph } = createImmediateHarness();

  runtime.scheduleReconcile('initial', { immediate: true });
  assert.deepEqual(sent.map((message) => message.command), ['deploy', 'start']);

  sent.length = 0;
  setGraph({
    nodes: [
      { ...node('scene', 'scene-fct-track'), config: { intensity: 0.7 } },
      node('out', 'scene-out'),
      node('client', 'client-object'),
    ],
    connections: [{ id: 'cmd', sourceNodeId: 'out', sourcePortId: 'cmd', targetNodeId: 'client', targetPortId: 'in' }],
  });

  runtime.onGraphStateChanged();

  assert.deepEqual(sent.map((message) => message.command), []);
  runtime.destroy();
});

test('patch runtime does not redeploy when unrelated canvas topology changes outside the active patch', () => {
  const { runtime, sent, setGraph } = createImmediateHarness();

  runtime.scheduleReconcile('initial', { immediate: true });
  sent.length = 0;

  setGraph({
    nodes: [
      node('scene', 'scene-fct-track'),
      node('out', 'scene-out'),
      node('client', 'client-object'),
      node('note-1', 'note'),
    ],
    connections: [{ id: 'cmd', sourceNodeId: 'out', sourcePortId: 'cmd', targetNodeId: 'client', targetPortId: 'in' }],
  });

  runtime.onGraphStateChanged();

  assert.deepEqual(sent.map((message) => message.command), []);
  runtime.destroy();
});

test('patch runtime routes overrides for source nodes outside compiled custom-node ids', () => {
  const graph: GraphState = {
    nodes: [node('number-1', 'number'), node('custom-1', 'custom:def-1')],
    connections: [
      {
        id: 'external-to-custom',
        sourceNodeId: 'number-1',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'amount',
      },
    ],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['number', definition('number', 'Number', [port('value', 'number')], [port('value', 'number')])],
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('amount', 'number')], [port('out', 'scene')])],
    ['client-object', definition('client-object', 'Client', [port('in', 'command')], [port('out', 'client')])],
  ]);
  const compiledGraph: GraphState = {
    nodes: [
      node('number-1', 'number'),
      node('cn:custom-1:scene', 'scene-fct-track'),
      node('cn:custom-1:out', 'scene-out'),
      node('cn:custom-1:client', 'client-object'),
    ],
    connections: [
      {
        id: 'compiled-input',
        sourceNodeId: 'number-1',
        sourcePortId: 'value',
        targetNodeId: 'cn:custom-1:scene',
        targetPortId: 'amount',
      },
      {
        id: 'compiled-cmd',
        sourceNodeId: 'cn:custom-1:out',
        sourcePortId: 'cmd',
        targetNodeId: 'cn:custom-1:client',
        targetPortId: 'in',
      },
    ],
  };
  const payload = basePayload();
  payload.graph = compiledGraph;
  payload.meta.loopId = 'patch:scene-out:cn:custom-1:out:compiled';

  const runtime = createPatchRuntime({
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportCompiledGraphForPatchPlanning: () => compiledGraph,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [{ clientId: 'client-1', group: 'audience', connected: true }],
      selectedClientIds: ['client-1'],
    }),
    displayTransport: {
      getAvailability: defaultAvailability,
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  });

  runtime.scheduleReconcile('compiled-custom-node', { immediate: true });
  sent.length = 0;

  runtime.sendNodeOverride('number-1', 'input', 'value', 1.23);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.command, 'override-set');
  assert.deepEqual((sent[0]?.payload as { overrides?: unknown[] }).overrides, [
    { nodeId: 'number-1', kind: 'input', portId: 'value', value: 1.23, ttlMs: 1500 },
  ]);
  runtime.destroy();
});

test('patch runtime redeploys when custom-node gate changes compiled topology', () => {
  let compiledGraph: GraphState = {
    nodes: [node('number-1', 'number')],
    connections: [],
  };
  let payloadGraph: GraphState = compiledGraph;
  const graph: GraphState = {
    nodes: [node('number-1', 'number'), node('custom-1', 'custom:def-1')],
    connections: [
      {
        id: 'external-to-custom',
        sourceNodeId: 'number-1',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'amount',
      },
    ],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['number', definition('number', 'Number', [port('value', 'number')], [port('value', 'number')])],
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('brightness', 'number')], [port('out', 'scene')])],
    ['client-object', definition('client-object', 'Client', [port('in', 'command')], [port('out', 'client')])],
  ]);

  const runtime = createPatchRuntime({
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportCompiledGraphForPatchPlanning: () => compiledGraph,
      exportGraphForPatchFromRootNodeIds: () => ({
        ...basePayload(),
        graph: payloadGraph,
        meta: {
          ...basePayload().meta,
          loopId: 'patch:scene-out:cn:custom-1:out:compiled',
        },
      }),
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [{ clientId: 'client-1', group: 'audience', connected: true }],
      selectedClientIds: ['client-1'],
    }),
    displayTransport: {
      getAvailability: defaultAvailability,
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  });

  runtime.onGraphStateChanged();
  assert.deepEqual(sent.map((message) => message.command), []);

  compiledGraph = {
    nodes: [
      node('number-1', 'number'),
      node('cn:custom-1:scene', 'scene-fct-track'),
      node('cn:custom-1:out', 'scene-out'),
      node('cn:custom-1:client', 'client-object'),
    ],
    connections: [
      {
        id: 'compiled-input',
        sourceNodeId: 'number-1',
        sourcePortId: 'value',
        targetNodeId: 'cn:custom-1:scene',
        targetPortId: 'brightness',
      },
      {
        id: 'compiled-cmd',
        sourceNodeId: 'cn:custom-1:out',
        sourcePortId: 'cmd',
        targetNodeId: 'cn:custom-1:client',
        targetPortId: 'in',
      },
    ],
  };
  payloadGraph = compiledGraph;

  runtime.onGraphStateChanged();

  assert.deepEqual(sent.map((message) => message.command), ['deploy', 'start']);
  assert.deepEqual(
    (sent[0]?.payload as PatchPayload | undefined)?.graph.nodes
      .map((n) => n.id)
      .sort((a, b) => String(a).localeCompare(String(b))),
    ['cn:custom-1:client', 'cn:custom-1:out', 'cn:custom-1:scene', 'number-1']
  );
  runtime.destroy();
});

test('patch runtime stops Display targets removed when display-object range shrinks', () => {
  const displayNode = node('display-node', 'display-object');
  displayNode.inputValues = { index: 1, range: 2, random: false };
  const graph: GraphState = {
    nodes: [node('scene', 'scene-fct-track'), node('out', 'scene-out'), displayNode],
    connections: [
      {
        id: 'display-cmd',
        sourceNodeId: 'out',
        sourcePortId: 'cmd',
        targetNodeId: 'display-node',
        targetPortId: 'in',
      },
    ],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('in', 'scene')], [port('out', 'scene')])],
    ['display-object', definition('display-object', 'Display', [port('in', 'command')], [])],
  ]);
  const payload = basePayload();
  payload.meta.loopId = 'patch:scene-out:out:display';

  const runtime = createPatchRuntime({
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [
        { clientId: 'display-1', group: 'display', connected: true },
        { clientId: 'display-2', group: 'display', connected: true },
      ],
      selectedClientIds: [],
    }),
    displayTransport: {
      getAvailability: () => ({
        route: 'server',
        hasLocalSession: false,
        hasLocalReady: false,
        hasRemoteDisplay: true,
      }),
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  });

  runtime.scheduleReconcile('initial', { immediate: true });
  assert.deepEqual(sent.map((message) => message.command), ['deploy', 'start', 'deploy', 'start']);

  sent.length = 0;
  displayNode.inputValues = { index: 1, range: 1, random: false };
  runtime.scheduleReconcile('display-selection', { immediate: true });

  assert.deepEqual(
    sent.map((message) => ({
      target: message.target,
      command: message.command,
      loopId: (message.payload as { loopId?: string }).loopId,
    })),
    [
      {
        target: { mode: 'group', groupId: 'client:display-2' },
        command: 'stop',
        loopId: 'patch:scene-out:out:display',
      },
      {
        target: { mode: 'group', groupId: 'client:display-2' },
        command: 'remove',
        loopId: 'patch:scene-out:out:display',
      },
    ]
  );
  runtime.destroy();
});

test('patch runtime detects display-object range shrink on the next runtime tick', () => {
  const displayNode = node('display-node', 'display-object');
  displayNode.inputValues = { index: 1, range: 2, random: false };
  const graph: GraphState = {
    nodes: [node('scene', 'scene-fct-track'), node('out', 'scene-out'), displayNode],
    connections: [
      {
        id: 'display-cmd',
        sourceNodeId: 'out',
        sourcePortId: 'cmd',
        targetNodeId: 'display-node',
        targetPortId: 'in',
      },
    ],
  };
  const sent: Array<{ target: unknown; pluginName: string; command: string; payload: unknown }> = [];
  const definitions = new Map<string, NodeDefinition>([
    ['scene-out', definition('scene-out', 'Scene Out', [], [port('cmd', 'command')])],
    ['scene-fct-track', definition('scene-fct-track', 'Scene FCT', [port('in', 'scene')], [port('out', 'scene')])],
    ['display-object', definition('display-object', 'Display', [port('in', 'command')], [])],
  ]);
  const payload = basePayload();
  payload.meta.loopId = 'patch:scene-out:out:display';

  const runtime = createPatchRuntime({
    nodeEngine: {
      getNode: (nodeId) => graph.nodes.find((candidate) => candidate.id === nodeId),
      getLastComputedInputs: () => null,
      exportGraphForPatchFromRootNodeIds: () => payload,
      lastError: writable<string | null>(null),
      setPatchOffloadedNodeIds: () => undefined,
      getTimeRangePlayheadSec: () => null,
    },
    nodeRegistry: { get: (type) => definitions.get(type) },
    adapter: {
      getNodeVisualState: () => ({}),
      setNodeVisualState: async () => undefined,
    } as unknown as CreatePatchRuntimeOptions['adapter'],
    isRunningStore: readable(true),
    getGraphState: () => graph,
    groupDisabledNodeIds: readable(new Set<string>()),
    executorStatusByClient: readable(new Map()),
    showExecutorLogs: writable(false),
    logsClientId: writable(''),
    loopController: null,
    managerState: readable({
      clients: [
        { clientId: 'display-1', group: 'display', connected: true },
        { clientId: 'display-2', group: 'display', connected: true },
      ],
      selectedClientIds: [],
    }),
    displayTransport: {
      getAvailability: () => ({
        route: 'server',
        hasLocalSession: false,
        hasLocalReady: false,
        hasRemoteDisplay: true,
      }),
      sendPlugin: defaultAvailability,
    },
    getSDK: () => ({
      sendPluginControl: (target, pluginName, command, nextPayload) => {
        sent.push({ target, pluginName, command, payload: nextPayload });
      },
    }),
    ensureDisplayLocalFilesRegisteredFromValue: () => undefined,
  });

  runtime.scheduleReconcile('initial', { immediate: true });
  sent.length = 0;

  displayNode.inputValues = { index: 1, range: 1, random: false };
  runtime.onTick();

  assert.deepEqual(
    sent.map((message) => ({
      target: message.target,
      command: message.command,
      loopId: (message.payload as { loopId?: string }).loopId,
    })),
    [
      {
        target: { mode: 'group', groupId: 'client:display-2' },
        command: 'stop',
        loopId: 'patch:scene-out:out:display',
      },
      {
        target: { mode: 'group', groupId: 'client:display-2' },
        command: 'remove',
        loopId: 'patch:scene-out:out:display',
      },
    ]
  );
  runtime.destroy();
});
