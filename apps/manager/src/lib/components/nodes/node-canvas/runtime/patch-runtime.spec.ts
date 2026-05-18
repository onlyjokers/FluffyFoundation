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
