// Purpose: tests for manager-side node connection validation helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection, GraphState, NodeDefinition } from './types';
import {
  getConnectionValidationError,
  getLocalOnlyPatchRoutingError,
} from './connection-validation';

const registry = new Map<string, NodeDefinition>();

const def = (id: string): NodeDefinition => {
  const hit = registry.get(id);
  if (!hit) throw new Error(`Missing test node definition: ${id}`);
  return hit;
};

const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
  inputValues: {},
  outputValues: {},
});

const connection = (
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): Connection => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

test('getConnectionValidationError rejects duplicate input connections', () => {
  const graph: GraphState = {
    nodes: [node('a', 'number'), node('b', 'number'), node('c', 'number')],
    connections: [connection('c1', 'a', 'out', 'c', 'in')],
  };

  const error = getConnectionValidationError({
    graph,
    connection: connection('c2', 'b', 'out', 'c', 'in'),
    getNodeDefinition: def,
  });

  assert.equal(error, 'The "in port" is connected up to once');
});

test('getConnectionValidationError rejects incompatible media ports before any-port fallback', () => {
  const graph: GraphState = {
    nodes: [node('audio', 'audio-source'), node('target', 'any-target')],
    connections: [],
  };

  const error = getConnectionValidationError({
    graph,
    connection: connection('c1', 'audio', 'out', 'target', 'in'),
    getNodeDefinition: def,
  });

  assert.equal(error, 'Type mismatch: audio connections must be audio -> audio (audio:out → target:in)');
});

test('getConnectionValidationError resolves group proxy port type from config', () => {
  const graph: GraphState = {
    nodes: [node('proxy', 'group-proxy', { portType: 'number' }), node('target', 'string-target')],
    connections: [],
  };

  const error = getConnectionValidationError({
    graph,
    connection: connection('c1', 'proxy', 'out', 'target', 'in'),
    getNodeDefinition: def,
  });

  assert.equal(error, 'Type mismatch: number -> string (proxy:out → target:in)');
});

test('getConnectionValidationError resolves logic-sleep output type from input connection', () => {
  const graph: GraphState = {
    nodes: [node('n', 'number'), node('sleep', 'logic-sleep'), node('target', 'string-target')],
    connections: [connection('c1', 'n', 'out', 'sleep', 'input')],
  };

  const error = getConnectionValidationError({
    graph,
    connection: connection('c2', 'sleep', 'output', 'target', 'in'),
    getNodeDefinition: def,
  });

  assert.equal(error, 'Type mismatch: number -> string (sleep:output → target:in)');
});

test('getLocalOnlyPatchRoutingError blocks local-only patch roots routed to client-object', () => {
  const graph: GraphState = {
    nodes: [
      node('asset', 'load-image-from-local'),
      node('root', 'image-out'),
      node('client', 'client-object'),
    ],
    connections: [
      connection('c1', 'asset', 'image', 'root', 'image'),
      connection('c2', 'root', 'cmd', 'client', 'in'),
    ],
  };

  assert.equal(
    getLocalOnlyPatchRoutingError({ graph, getNodeDefinition: def }),
    'Load * From Local(Display only) can only connect Deploy to Display (not Client).'
  );
});

test('getLocalOnlyPatchRoutingError allows local-only patch roots routed to display-object', () => {
  const graph: GraphState = {
    nodes: [
      node('asset', 'load-video-from-local'),
      node('root', 'video-out'),
      node('display', 'display-object'),
    ],
    connections: [
      connection('c1', 'asset', 'video', 'root', 'video'),
      connection('c2', 'root', 'cmd', 'display', 'in'),
    ],
  };

  assert.equal(getLocalOnlyPatchRoutingError({ graph, getNodeDefinition: def }), null);
});

registry.set('number', {
  type: 'number',
  label: 'Number',
  inputs: [],
  outputs: [{ id: 'out', type: 'number' }],
  process: () => ({}),
});

registry.set('audio-source', {
  type: 'audio-source',
  label: 'Audio',
  inputs: [],
  outputs: [{ id: 'out', type: 'audio' }],
  process: () => ({}),
});

registry.set('any-target', {
  type: 'any-target',
  label: 'Any Target',
  inputs: [{ id: 'in', type: 'any' }],
  outputs: [],
  process: () => ({}),
});

registry.set('string-target', {
  type: 'string-target',
  label: 'String Target',
  inputs: [{ id: 'in', type: 'string' }],
  outputs: [],
  process: () => ({}),
});

registry.set('group-proxy', {
  type: 'group-proxy',
  label: 'Group Proxy',
  inputs: [],
  outputs: [{ id: 'out', type: 'any' }],
  process: () => ({}),
});

registry.set('logic-sleep', {
  type: 'logic-sleep',
  label: 'Sleep',
  inputs: [{ id: 'input', type: 'any' }],
  outputs: [{ id: 'output', type: 'any' }],
  process: () => ({}),
});

registry.set('load-image-from-local', {
  type: 'load-image-from-local',
  label: 'Local Image',
  inputs: [],
  outputs: [{ id: 'image', type: 'image' }],
  process: () => ({}),
});

registry.set('load-video-from-local', {
  type: 'load-video-from-local',
  label: 'Local Video',
  inputs: [],
  outputs: [{ id: 'video', type: 'video' }],
  process: () => ({}),
});

registry.set('image-out', {
  type: 'image-out',
  label: 'Image Out',
  inputs: [{ id: 'image', type: 'image' }],
  outputs: [{ id: 'cmd', type: 'command' }],
  process: () => ({}),
});

registry.set('video-out', {
  type: 'video-out',
  label: 'Video Out',
  inputs: [{ id: 'video', type: 'video' }],
  outputs: [{ id: 'cmd', type: 'command' }],
  process: () => ({}),
});

registry.set('client-object', {
  type: 'client-object',
  label: 'Client',
  inputs: [{ id: 'in', type: 'command' }],
  outputs: [],
  process: () => ({}),
});

registry.set('display-object', {
  type: 'display-object',
  label: 'Display',
  inputs: [{ id: 'in', type: 'command' }],
  outputs: [],
  process: () => ({}),
});
