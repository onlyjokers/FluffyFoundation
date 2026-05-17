// Purpose: tests for patch deployment target planning.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection, GraphState, NodeDefinition, NodeInstance } from '$lib/nodes/types';
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
    getLastComputedInputs: () => null,
    setLastError: (message) => {
      if (message) errors.push(message);
    },
    getLastError: () => errors.at(-1) ?? null,
    ...opts,
  });

test('resolvePatchDeploymentPlan routes a single patch root to a connected client-object', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [
      node('root', 'image-out'),
      node('client-node', 'client-object', {}, { clientId: 'client-a' }),
    ],
    connections: [connection('c1', 'root', 'cmd', 'client-node', 'in')],
  };

  const result = plan(graph);

  assert.ok(result);
  assert.deepEqual(result.targetClientIds, ['client-a']);
  assert.deepEqual(result.rootIdsByClientId.get('client-a'), ['root']);
  assert.equal(result.planKey, 'client-a=root');
});

test('resolvePatchDeploymentPlan routes display-object to local display before remote display clients', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root', 'video-out'), node('display-node', 'display-object')],
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
    nodes: [node('root', 'video-out'), node('display-node', 'display-object')],
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
    nodes: [node('root', 'video-out'), node('display-node', 'display-object')],
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
    nodes: [node('root', 'video-out'), node('display-node', 'display-object')],
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
      node('root', 'video-out'),
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

test('resolvePatchDeploymentPlan reports multiple enabled roots without active deploy routing', () => {
  errors.length = 0;
  const graph: GraphState = {
    nodes: [node('root-a', 'image-out'), node('root-b', 'video-out')],
    connections: [],
  };

  const result = plan(graph);

  assert.equal(result, null);
  assert.equal(
    errors[0],
    'Multiple patch roots found (image-out:root-a, video-out:root-b). Connect Deploy on one or more roots (or delete the others).'
  );
});

definitions.set('image-out', {
  type: 'image-out',
  label: 'Image Out',
  inputs: [],
  outputs: [{ id: 'cmd', type: 'command' }],
  process: () => ({}),
});

definitions.set('video-out', {
  type: 'video-out',
  label: 'Video Out',
  inputs: [],
  outputs: [{ id: 'cmd', type: 'command' }],
  process: () => ({}),
});

definitions.set('client-object', {
  type: 'client-object',
  label: 'Client',
  inputs: [{ id: 'in', type: 'command' }],
  outputs: [{ id: 'out', type: 'client' }],
  process: () => ({}),
});

definitions.set('display-object', {
  type: 'display-object',
  label: 'Display',
  inputs: [{ id: 'in', type: 'command' }],
  outputs: [],
  process: () => ({}),
});
