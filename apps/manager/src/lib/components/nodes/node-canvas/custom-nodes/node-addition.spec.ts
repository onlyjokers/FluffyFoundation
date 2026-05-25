// Purpose: Verify add-node commands write into expanded Custom Node projections when appropriate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import type { NodeInstance } from '$lib/nodes/types';
import { createNodeAdder } from './node-addition';

test('createNodeAdder writes normal nodes into an expanded custom node host', () => {
  const addedCanonical: NodeInstance[] = [];
  const addedProjection: NodeInstance[] = [];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({ configSchema: [{ key: 'value', defaultValue: 1 }] }),
    },
    nodeEngine: {
      getNode: () => undefined,
    },
    customNodeTypePrefix: 'custom:',
    getCustomNodeDefinition: () => undefined,
    cloneInternalGraphForNewInstance: (graph) => graph,
    generateCustomNodeGroupId: () => 'group:new',
    readCustomNodeState: () => null,
    writeCustomNodeState: (config) => config,
    customNodeDefinitions: writable([]),
    wouldCreateCycle: () => false,
    getGroupFrames: () => [
      {
        group: { id: 'group:expanded' },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        depth: 0,
      },
    ],
    expandedCustomByGroupId: new Map([['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }]]),
    getNodeCount: () => 0,
    generateId: () => 'node-new',
    addNodeCommand: (node) => addedCanonical.push(node),
    addProjectionNodeCommand: (ownerNodeId, node) => {
      assert.equal(ownerNodeId, 'custom-1');
      addedProjection.push(node);
      return `view:custom:${ownerNodeId}:${node.id}`;
    },
  });

  const nodeId = addNode('float', { x: 160, y: 180 });

  assert.equal(nodeId, 'view:custom:custom-1:node-new');
  assert.deepEqual(addedCanonical, []);
  assert.equal(addedProjection.length, 1);
  assert.deepEqual(addedProjection[0]?.config, { value: 1 });
  assert.deepEqual(addedProjection[0]?.position, { x: 160, y: 180 });
});

test('createNodeAdder uses expanded custom groupId hints for edge proxy nodes outside the frame', () => {
  const addedCanonical: NodeInstance[] = [];
  const addedProjection: NodeInstance[] = [];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({ configSchema: [] }),
    },
    nodeEngine: {
      getNode: () => undefined,
    },
    customNodeTypePrefix: 'custom:',
    getCustomNodeDefinition: () => undefined,
    cloneInternalGraphForNewInstance: (graph) => graph,
    generateCustomNodeGroupId: () => 'group:new',
    readCustomNodeState: () => null,
    writeCustomNodeState: (config) => config,
    customNodeDefinitions: writable([]),
    wouldCreateCycle: () => false,
    getGroupFrames: () => [
      {
        group: { id: 'group:expanded' },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        depth: 0,
      },
    ],
    expandedCustomByGroupId: new Map([['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }]]),
    getNodeCount: () => 0,
    generateId: () => 'proxy-new',
    addNodeCommand: (node) => addedCanonical.push(node),
    addProjectionNodeCommand: (ownerNodeId, node) => {
      assert.equal(ownerNodeId, 'custom-1');
      addedProjection.push(node);
      return `view:custom:${ownerNodeId}:${node.id}`;
    },
  });

  const nodeId = addNode('group-proxy', { x: 64, y: 180 }, { groupId: 'group:expanded', direction: 'input' });

  assert.equal(nodeId, 'view:custom:custom-1:proxy-new');
  assert.deepEqual(addedCanonical, []);
  assert.equal(addedProjection.length, 1);
  assert.deepEqual(addedProjection[0]?.config, { groupId: 'group:expanded', direction: 'input' });
});
