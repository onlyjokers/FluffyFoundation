// Purpose: tests for manager-side node connection validation helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection, GraphState, NodeDefinition, NodePort } from './types';
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

const port = (id: string, type: NodePort['type']): NodePort => ({ id, label: id, type });
const nodeDef = (definition: Omit<NodeDefinition, 'configSchema'> & Partial<Pick<NodeDefinition, 'configSchema'>>): NodeDefinition => ({
  ...definition,
  configSchema: definition.configSchema ?? [],
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

test('getLocalOnlyPatchRoutingError blocks local-only patch roots routed to client-executor', () => {
  const graph: GraphState = {
    nodes: [
      node('asset', 'load-image-from-local'),
      node('root', 'proc-show-image'),
      node('client', 'client-executor'),
    ],
    connections: [
      connection('c1', 'asset', 'image', 'root', 'in'),
      connection('c2', 'root', 'cmd', 'client', 'in'),
    ],
  };

  assert.equal(
    getLocalOnlyPatchRoutingError({ graph, getNodeDefinition: def }),
    'Load * From Local(Display) can only connect Deploy to Display (not Client Executor).'
  );
});

test('getLocalOnlyPatchRoutingError allows local-only patch roots routed to display-object', () => {
  const graph: GraphState = {
    nodes: [
      node('asset', 'load-video-from-local'),
      node('root', 'proc-play-video'),
      node('display', 'display-object'),
    ],
    connections: [
      connection('c1', 'asset', 'video', 'root', 'in'),
      connection('c2', 'root', 'cmd', 'display', 'in'),
    ],
  };

  assert.equal(getLocalOnlyPatchRoutingError({ graph, getNodeDefinition: def }), null);
});

registry.set('number', nodeDef({
  type: 'number',
  label: 'Number',
  category: 'Values',
  inputs: [],
  outputs: [port('out', 'number')],
  process: () => ({}),
}));

registry.set('audio-source', nodeDef({
  type: 'audio-source',
  label: 'Audio',
  category: 'Values',
  inputs: [],
  outputs: [port('out', 'audio')],
  process: () => ({}),
}));

registry.set('any-target', nodeDef({
  type: 'any-target',
  label: 'Any Target',
  category: 'Values',
  inputs: [port('in', 'any')],
  outputs: [],
  process: () => ({}),
}));

registry.set('string-target', nodeDef({
  type: 'string-target',
  label: 'String Target',
  category: 'Values',
  inputs: [port('in', 'string')],
  outputs: [],
  process: () => ({}),
}));

registry.set('group-proxy', nodeDef({
  type: 'group-proxy',
  label: 'Group Proxy',
  category: 'Values',
  inputs: [],
  outputs: [port('out', 'any')],
  process: () => ({}),
}));

registry.set('logic-sleep', nodeDef({
  type: 'logic-sleep',
  label: 'Sleep',
  category: 'Logic',
  inputs: [port('input', 'any')],
  outputs: [port('output', 'any')],
  process: () => ({}),
}));

registry.set('load-image-from-local', nodeDef({
  type: 'load-image-from-local',
  label: 'Local Image',
  category: 'Assets',
  inputs: [],
  outputs: [port('image', 'image')],
  process: () => ({}),
}));

registry.set('load-video-from-local', nodeDef({
  type: 'load-video-from-local',
  label: 'Local Video',
  category: 'Assets',
  inputs: [],
  outputs: [port('video', 'video')],
  process: () => ({}),
}));

registry.set('proc-show-image', nodeDef({
  type: 'proc-show-image',
  label: 'Image Player',
  category: 'Scene',
  inputs: [port('in', 'image')],
  outputs: [port('cmd', 'command')],
  process: () => ({}),
}));

registry.set('proc-play-video', nodeDef({
  type: 'proc-play-video',
  label: 'Video Player',
  category: 'Scene',
  inputs: [port('in', 'video')],
  outputs: [port('cmd', 'command')],
  process: () => ({}),
}));

registry.set('client-executor', nodeDef({
  type: 'client-executor',
  label: 'Client Executor',
  category: 'Objects',
  inputs: [port('in', 'command')],
  outputs: [],
  process: () => ({}),
}));

registry.set('display-object', nodeDef({
  type: 'display-object',
  label: 'Display',
  category: 'Objects',
  inputs: [port('in', 'command')],
  outputs: [],
  process: () => ({}),
}));
