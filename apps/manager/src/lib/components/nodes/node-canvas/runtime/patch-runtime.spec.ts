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
import type { GraphState, NodeDefinition, NodeInstance } from '$lib/nodes/types';

const node = (id: string, type: string): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
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
    ['scene-out', { type: 'scene-out', label: 'Scene Out', inputs: [], outputs: [{ id: 'cmd', type: 'command' }], process: () => ({}) }],
    ['scene-fct-track', { type: 'scene-fct-track', label: 'Scene FCT', inputs: [{ id: 'in', type: 'scene' }], outputs: [{ id: 'out', type: 'scene' }], process: () => ({}) }],
    ['client-object', { type: 'client-object', label: 'Client', inputs: [{ id: 'in', type: 'command' }], outputs: [{ id: 'out', type: 'client' }], process: () => ({}) }],
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
    ['scene-out', { type: 'scene-out', label: 'Scene Out', inputs: [], outputs: [{ id: 'cmd', type: 'command' }], process: () => ({}) }],
    ['scene-fct-track', { type: 'scene-fct-track', label: 'Scene FCT', inputs: [{ id: 'in', type: 'scene' }], outputs: [{ id: 'out', type: 'scene' }], process: () => ({}) }],
    ['client-object', { type: 'client-object', label: 'Client', inputs: [{ id: 'in', type: 'command' }], outputs: [{ id: 'out', type: 'client' }], process: () => ({}) }],
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
      getAvailability: () => ({
        route: 'server',
        hasLocalSession: false,
        hasLocalReady: false,
        hasRemoteDisplay: false,
      }),
      sendPlugin: () => undefined,
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
    ['scene-out', { type: 'scene-out', label: 'Scene Out', inputs: [], outputs: [{ id: 'cmd', type: 'command' }], process: () => ({}) }],
    ['scene-fct-track', { type: 'scene-fct-track', label: 'Scene FCT', inputs: [{ id: 'in', type: 'scene' }], outputs: [{ id: 'out', type: 'scene' }], process: () => ({}) }],
    ['client-object', { type: 'client-object', label: 'Client', inputs: [{ id: 'in', type: 'command' }], outputs: [{ id: 'out', type: 'client' }], process: () => ({}) }],
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
    } as CreatePatchRuntimeOptions['adapter'],
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
      getAvailability: () => ({
        route: 'server',
        hasLocalSession: false,
        hasLocalReady: false,
        hasRemoteDisplay: false,
      }),
      sendPlugin: () => undefined,
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
