// Purpose: tests for patch deployment target planning.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  Connection,
  GraphState,
  NodeDefinition,
  NodeInstance,
  NodePort,
} from '$lib/nodes/types';
import { resolvePatchDeploymentPlan } from './patch-deployment-plan';

const definitions = new Map<string, NodeDefinition>();
const errors: string[] = [];

const node = (
  id: string,
  type: string,
  inputValues: Record<string, unknown> = {},
  config: Record<string, unknown> = {}
): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
  inputValues,
  outputValues: {},
});

const connection = (
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): Connection => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

const port = (id: string, type: NodePort['type']): NodePort => ({ id, label: id, type });

const plan = (
  graph: GraphState,
  opts: Partial<Parameters<typeof resolvePatchDeploymentPlan>[0]> = {}
) =>
  resolvePatchDeploymentPlan({
    graph,
    disabledNodeIds: new Set(),
    clientIdsInOrder: () => ['client-a', 'display-1', 'display-2'],
    audienceClientIdsInOrder: () => ['client-a'],
    getManagerClients: () => [
      { clientId: 'client-a', group: 'audience' },
      { clientId: 'display-1', group: 'display' },
      { clientId: 'display-2', group: 'display' },
    ],
    localDisplayTargetId: 'local:display',
    getDisplayAvailability: () => ({
      route: 'local',
      hasLocalSession: true,
      hasLocalReady: true,
      hasRemoteDisplay: false,
    }),
    getNodeDefinition: (type) => definitions.get(type),
    getRuntimeNode: (id) => graph.nodes.find((candidate) => candidate.id === id),
    getLastComputedInputs: (nodeId) =>
      String(nodeId).includes('client-node')
        ? { client: { clientId: 'client-a', clientIds: ['client-a'] } }
        : null,
    setLastError: (message) => {
      if (message) errors.push(message);
    },
    getLastError: () => errors.at(-1) ?? null,
    ...opts,
  });

test('resolvePatchDeploymentPlan lets client-loader loadAll override index and range fallback', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'audio-out'),
      node('loader-node', 'client-loader', { loadAll: true, index: 2, range: 1, random: false }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('c1', 'root', 'cmd', 'client-node', 'in'),
      connection('c2', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph, {
    audienceClientIdsInOrder: () => ['client-a', 'client-b', 'client-c'],
    getManagerClients: () => [
      { clientId: 'client-a', group: 'audience' },
      { clientId: 'client-b', group: 'audience' },
      { clientId: 'client-c', group: 'audience' },
    ],
    getLastComputedInputs: () => null,
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a', 'client-b', 'client-c']);
  assert.equal(result.planKey, 'client-a=root|client-b=root|client-c=root');
});

test('resolvePatchDeploymentPlan routes a single patch root to a connected client-executor', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'audio-out'),
      node('loader-node', 'client-loader', {}, { clientId: 'client-a' }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('c1', 'root', 'cmd', 'client-node', 'in'),
      connection('c2', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['root']);
  assert.equal(result.planKey, 'client-a=root');
});

test('resolvePatchDeploymentPlan falls back to connected client-loader when executor inputs are not computed yet', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'audio-out'),
      node('loader-node', 'client-loader', { index: 1, range: 1, random: false }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('c1', 'root', 'cmd', 'client-node', 'in'),
      connection('c2', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph, {
    getLastComputedInputs: () => null,
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['root']);
  assert.equal(result.planKey, 'client-a=root');
});

test('resolvePatchDeploymentPlan routes Static UI Player to a connected client-executor', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('button', 'client-button'),
      node('root', 'ui-out'),
      node('loader-node', 'client-loader', {}, { clientId: 'client-a' }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('c1', 'button', 'out', 'root', 'in'),
      connection('c2', 'root', 'cmd', 'client-node', 'in'),
      connection('c3', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['root']);
  assert.equal(result.planKey, 'client-a=root');
});

test('resolvePatchDeploymentPlan keeps UI variable feedback patches targeted at client-executor', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('button', 'client-button'),
      node('pressed-set', 'set-boolean-variable', {}, { name: 'pressed', defaultValue: false }),
      node('pressed-get', 'get-boolean-variable', {}, { name: 'pressed', defaultValue: false }),
      node('not-pressed', 'logic-not'),
      node('root', 'ui-out'),
      node('loader-node', 'client-loader', {}, { clientId: 'client-a' }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('button-pressed', 'button', 'pressed', 'pressed-set', 'set'),
      connection('pressed-not', 'pressed-get', 'value', 'not-pressed', 'in'),
      connection('not-display', 'not-pressed', 'out', 'button', 'display'),
      connection('button-ui', 'button', 'out', 'root', 'in'),
      connection('root-command', 'root', 'cmd', 'client-node', 'in'),
      connection('client-link', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['root']);
  assert.equal(result.planKey, 'client-a=root');
});

test('resolvePatchDeploymentPlan can plan from a compiled custom-node patch graph', () => {
  errors.length = 0;
  const editorGraph: GraphState = {
    nodes: [node('custom-1', 'custom:def-1')],
    connections: [],
  };
  const compiledGraph: GraphState = {
    nodes: [
      node('cn:custom-1:root', 'audio-out'),
      node('cn:custom-1:loader-node', 'client-loader', {}, { clientId: 'client-a' }),
      node('cn:custom-1:client-node', 'client-executor'),
    ],
    connections: [
      connection('compiled-cmd', 'cn:custom-1:root', 'cmd', 'cn:custom-1:client-node', 'in'),
      connection(
        'compiled-client',
        'cn:custom-1:loader-node',
        'client',
        'cn:custom-1:client-node',
        'client'
      ),
    ],
  };

  const result = plan(editorGraph, {
    compiledGraph,
    getRuntimeNode: (id) => editorGraph.nodes.find((candidate) => candidate.id === id),
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['cn:custom-1:root']);
  assert.equal(result.planKey, 'client-a=cn:custom-1:root');
});

test('resolvePatchDeploymentPlan routes compiled custom UI patches through command aggregators', () => {
  errors.length = 0;
  const editorGraph: GraphState = {
    nodes: [node('custom-ui', 'custom:def-ui')],
    connections: [],
  };
  const compiledGraph: GraphState = {
    nodes: [
      node('cn:custom-ui:button', 'client-button', { display: true }),
      node('cn:custom-ui:root', 'ui-out'),
      node('cn:custom-ui:aggregator', 'cmd-aggregator'),
      node('cn:custom-ui:loader', 'client-loader', { index: 1, range: 1, random: false }),
      node('cn:custom-ui:executor', 'client-executor'),
    ],
    connections: [
      connection('button-ui', 'cn:custom-ui:button', 'out', 'cn:custom-ui:root', 'in'),
      connection('root-command', 'cn:custom-ui:root', 'cmd', 'cn:custom-ui:aggregator', 'in1'),
      connection('aggregated-command', 'cn:custom-ui:aggregator', 'cmd', 'cn:custom-ui:executor', 'in'),
      connection('client-link', 'cn:custom-ui:loader', 'client', 'cn:custom-ui:executor', 'client'),
    ],
  };

  const result = plan(editorGraph, {
    compiledGraph,
    getRuntimeNode: (id) => editorGraph.nodes.find((candidate) => candidate.id === id),
    getLastComputedInputs: () => null,
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['cn:custom-ui:root']);
  assert.equal(result.planKey, 'client-a=cn:custom-ui:root');
});

test('resolvePatchDeploymentPlan clears transient unavailable-target errors after targets recover', () => {
  errors.length = 0;
  errors.push('Patch target unavailable; keeping the previous deployment running.');
  const graph: GraphState = {
    nodes: [
      node('root', 'ui-out'),
      node('loader-node', 'client-loader', { index: 1, range: 1, random: false }),
      node('client-node', 'client-executor'),
    ],
    connections: [
      connection('root-command', 'root', 'cmd', 'client-node', 'in'),
      connection('client-link', 'loader-node', 'client', 'client-node', 'client'),
    ],
  };

  const result = plan(graph, {
    getLastComputedInputs: () => null,
    setLastError: (message) => {
      errors.push(message ?? '');
    },
  });

  assert.ok(result);
  assert.equal(errors.at(-1), '');
});

test('resolvePatchDeploymentPlan routes display-object to local display before remote display clients', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root', 'scene-out'), node('display-node', 'display-object')],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['local:display', 'display-1', 'display-2']);
  assert.deepEqual(result.rootIdsByClientId.get('local:display'), ['root']);
  assert.deepEqual(result.rootIdsByClientId.get('display-1'), ['root']);
  assert.deepEqual(result.rootIdsByClientId.get('display-2'), ['root']);
  assert.equal(result.planKey, 'display-1=root|display-2=root|local:display=root');
});

test('resolvePatchDeploymentPlan ignores disconnected remote displays', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root', 'scene-out'), node('display-node', 'display-object')],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph, {
    getDisplayAvailability: () => ({
      hasLocalSession: false,
      hasLocalReady: false,
    }),
    getManagerClients: () => [
      { clientId: 'client-a', group: 'audience', connected: true },
      { clientId: 'display-1', group: 'display', connected: false },
      { clientId: 'display-2', group: 'display', connected: true },
    ],
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['display-2']);
  assert.equal(result.rootIdsByClientId.has('display-1'), false);
  assert.deepEqual(result.rootIdsByClientId.get('display-2'), ['root']);
});

test('resolvePatchDeploymentPlan records target revisions for reconnect redeploys', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root', 'scene-out'), node('display-node', 'display-object')],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph, {
    getDisplayAvailability: () => ({
      hasLocalSession: true,
      hasLocalReady: true,
      localSessionKey: 'local-ready-2',
    }),
    getManagerClients: () => [
      { clientId: 'client-a', group: 'audience', connectedAt: 100 },
      { clientId: 'display-1', group: 'display', connectedAt: 200 },
      { clientId: 'display-2', group: 'display', connectedAt: 300 },
    ],
  });

  assert.ok(result);
  assert.equal(result.targetRevisionByClientId.get('local:display'), 'local-ready-2');
  assert.equal(result.targetRevisionByClientId.get('display-1'), '200');
  assert.equal(result.targetRevisionByClientId.get('display-2'), '300');
});

test('resolvePatchDeploymentPlan avoids local display when the paired session is not ready', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root', 'scene-out'), node('display-node', 'display-object')],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph, {
    getDisplayAvailability: () => ({
      hasLocalSession: true,
      hasLocalReady: false,
    }),
  });

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['display-1', 'display-2']);
  assert.equal(result.rootIdsByClientId.has('local:display'), false);
  assert.equal(result.planKey, 'display-1=root|display-2=root');
});

test('resolvePatchDeploymentPlan routes display-object to the selected display client', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'scene-out'),
      node('display-node', 'display-object', {}, { displayId: 'display-2' }),
    ],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['display-2']);
  assert.equal(result.rootIdsByClientId.has('local:display'), false);
  assert.equal(result.rootIdsByClientId.has('display-1'), false);
  assert.deepEqual(result.rootIdsByClientId.get('display-2'), ['root']);
  assert.equal(result.planKey, 'display-2=root');
});

test('resolvePatchDeploymentPlan lets display-object index and range override the selected display client', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'scene-out'),
      node('display-node', 'display-object', { index: 1, range: 2 }, { displayId: 'display-2' }),
    ],
    connections: [connection('c1', 'root', 'cmd', 'display-node', 'in')],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['display-1', 'display-2']);
  assert.equal(result.rootIdsByClientId.has('local:display'), false);
  assert.deepEqual(result.rootIdsByClientId.get('display-1'), ['root']);
  assert.deepEqual(result.rootIdsByClientId.get('display-2'), ['root']);
  assert.equal(result.planKey, 'display-1=root|display-2=root');
});

test('resolvePatchDeploymentPlan reports multiple enabled roots without active deploy routing', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root-a', 'audio-out'), node('root-b', 'scene-out')],
    connections: [],
  };

  const result = plan(graph);

  assert.equal(result, null);
  assert.equal(
    errors[0],
    'Multiple patch roots found (audio-out:root-a, scene-out:root-b). Connect Deploy on one or more roots (or delete the others).'
  );
});

definitions.set('audio-out', {
  type: 'audio-out',
  label: 'Audio Out',
  category: 'Scene',
  inputs: [],
  outputs: [port('cmd', 'command')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('scene-out', {
  type: 'scene-out',
  label: 'Scene Out',
  category: 'Scene',
  inputs: [],
  outputs: [port('cmd', 'command')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('ui-out', {
  type: 'ui-out',
  label: 'Static UI Player',
  category: 'Player',
  inputs: [port('in', 'ui')],
  outputs: [port('cmd', 'command')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('client-button', {
  type: 'client-button',
  label: 'Client Button',
  category: 'ClientUI',
  inputs: [port('in', 'ui'), port('display', 'boolean')],
  outputs: [port('out', 'ui'), port('pressed', 'boolean')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('boolean-variable', {
  type: 'boolean-variable',
  label: 'Boolean Variable',
  category: 'Values',
  inputs: [
    { ...port('set', 'boolean'), kind: 'sink' },
    { ...port('reset', 'boolean'), kind: 'sink' },
  ],
  outputs: [port('value', 'boolean')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('set-boolean-variable', {
  type: 'set-boolean-variable',
  label: 'Set Boolean Variable',
  category: 'Values',
  inputs: [
    { ...port('set', 'boolean'), kind: 'sink' },
    { ...port('reset', 'boolean'), kind: 'sink' },
  ],
  outputs: [],
  configSchema: [],
  process: () => ({}),
});

definitions.set('get-boolean-variable', {
  type: 'get-boolean-variable',
  label: 'Get Boolean Variable',
  category: 'Values',
  inputs: [],
  outputs: [port('value', 'boolean')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('logic-not', {
  type: 'logic-not',
  label: 'NOT',
  category: 'Gate',
  inputs: [port('in', 'boolean')],
  outputs: [port('out', 'boolean')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('client-loader', {
  type: 'client-loader',
  label: 'Client Loader',
  category: 'Objects',
  inputs: [port('index', 'number')],
  outputs: [port('client', 'client')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('client-executor', {
  type: 'client-executor',
  label: 'Client Executor',
  category: 'Objects',
  inputs: [port('client', 'client'), port('in', 'command')],
  outputs: [port('imageOut', 'image')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('cmd-aggregator', {
  type: 'cmd-aggregator',
  label: 'Cmd Aggregator',
  category: 'Objects',
  inputs: [port('in1', 'command'), port('in2', 'command'), port('in3', 'command')],
  outputs: [port('cmd', 'command')],
  configSchema: [],
  process: () => ({}),
});

definitions.set('display-object', {
  type: 'display-object',
  label: 'Display',
  category: 'Objects',
  inputs: [port('in', 'command')],
  outputs: [],
  configSchema: [],
  process: () => ({}),
});
