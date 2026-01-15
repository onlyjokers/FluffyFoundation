import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import type { NodeRegistry } from '@shugu/node-core';
import { createCustomNodeExpansion } from './custom-node-expansion';
import { createCustomNodeActions } from './custom-node-actions';

const makeNode = (id: string): NodeInstance => ({
  id,
  type: 'number',
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('handleExpandCustomNode skips non-object internal entries', () => {
  const addedNodes: NodeInstance[] = [];
  const addedConnections: Connection[] = [];

  const motherNode: NodeInstance = {
    id: 'node-1',
    type: 'custom-node',
    position: { x: 10, y: 20 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  const internalGraph: GraphState = {
    nodes: [null as unknown as NodeInstance, makeNode('inner-1')],
    connections: [null as unknown as Connection],
  };

  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group-1',
    role: 'mother',
    manualGate: true,
    internal: internalGraph,
  };

  const def: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Custom Node',
    template: { nodes: [], connections: [] },
    ports: [],
  };

  const groupStore = writable([]);
  const framesStore = writable([]);

  const expansion = createCustomNodeExpansion({
    expandedCustomByGroupId: new Map(),
    forcedHiddenNodeIds: new Set(),
    nodeEngine: {
      getNode: (nodeId) => (nodeId === motherNode.id ? motherNode : null),
      addNode: (node) => {
        addedNodes.push(node);
      },
      removeNode: () => {},
      addConnection: (conn) => {
        addedConnections.push(conn);
      },
      removeConnection: () => {},
      updateNodePosition: () => {},
      updateNodeConfig: () => {},
      updateNodeInputValue: () => {},
      exportGraph: () => ({ nodes: [], connections: [] }),
    },
    groupController: {
      nodeGroups: groupStore,
      setGroups: (groups) => groupStore.set(groups),
      scheduleHighlight: () => {},
    },
    groupPortNodesController: {
      ensureGroupPortNodes: () => {},
      scheduleAlign: () => {},
      scheduleNormalizeProxies: () => {},
    },
    groupFrames: framesStore,
    nodeRegistry: { get: () => null } as NodeRegistry,
    requestFramesUpdate: () => {},
    readCustomNodeState: () => state,
    writeCustomNodeState: (config) => config,
    getCustomNodeDefinition: (definitionId) => (definitionId === def.definitionId ? def : null),
    upsertCustomNodeDefinition: () => {},
    customNodeDefinitions: writable([]),
    definitionsInCycles: () => new Set(),
    buildGroupPortIndex: () => new Map(),
    groupIdFromNode: () => null,
    isGroupPortNodeType: () => false,
    deepestGroupIdContainingNode: () => null,
    syncCoupledCustomNodesForDefinition: () => {},
    materializeInternalNodeId: (customNodeId, internalNodeId) =>
      `cn:${customNodeId}:${internalNodeId}`,
    isMaterializedInternalNodeId: (customNodeId, nodeId) =>
      nodeId.startsWith(`cn:${customNodeId}:`),
    internalNodeIdFromMaterialized: (customNodeId, nodeId) =>
      nodeId.replace(`cn:${customNodeId}:`, ''),
    customNodeIdFromMaterializedNodeId: (nodeId) => {
      if (!nodeId.startsWith('cn:')) return null;
      const parts = nodeId.split(':');
      return parts.length > 2 ? parts[1] : null;
    },
  });

  assert.doesNotThrow(() => expansion.handleExpandCustomNode(motherNode.id));
  assert.equal(addedNodes.length, 1);
  assert.equal(addedConnections.length, 0);
});

test('handleDenodalizeGroup ignores non-object graph nodes', () => {
  const motherNode: NodeInstance = {
    id: 'mother-1',
    type: 'custom-node',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group-1',
    role: 'mother',
    manualGate: true,
    internal: { nodes: [], connections: [] },
  };

  const groupStore = writable([
    { id: 'group-1', parentId: null, name: 'Group', nodeIds: [] },
  ]);

  const originalConfirm = globalThis.confirm;
  (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm = () => true;

  const actions = createCustomNodeActions({
    nodeEngine: {
      getNode: (nodeId) => (nodeId === motherNode.id ? motherNode : null),
      exportGraph: () => ({
        nodes: [null as unknown as NodeInstance],
        connections: [],
      }),
      updateNodeType: () => {},
      updateNodeConfig: () => {},
      updateNodeInputValue: () => {},
      updateNodePosition: () => {},
      addNode: () => {},
      removeNode: () => {},
      addConnection: () => {},
      removeConnection: () => {},
    },
    nodeRegistry: { get: () => null } as NodeRegistry,
    groupController: {
      nodeGroups: groupStore,
      setGroups: (groups) => groupStore.set(groups),
      disassembleGroup: () => {},
      scheduleHighlight: () => {},
    },
    groupPortNodesController: {
      ensureGroupPortNodes: () => {},
      disassembleGroupAndPorts: () => {},
      scheduleNormalizeProxies: () => {},
    },
    groupFrames: writable([]),
    viewAdapter: {
      getNodePosition: () => null,
    },
    buildGroupPortIndex: () => new Map(),
    groupIdFromNode: () => null,
    customNodeType: () => 'custom-node',
    addCustomNodeDefinition: () => {},
    removeCustomNodeDefinition: () => {},
    getCustomNodeDefinition: () => ({
      definitionId: 'def-1',
      name: 'Custom',
      template: { nodes: [], connections: [] },
      ports: [],
    }),
    readCustomNodeState: () => state,
    writeCustomNodeState: (config) => config,
    expandedCustomByGroupId: new Map([['group-1', { groupId: 'group-1', nodeId: motherNode.id }]]),
    forcedHiddenNodeIds: new Set(),
    refreshExpandedCustomGroupIds: () => {},
    requestFramesUpdate: () => {},
    setSelectedNode: () => {},
  });

  assert.doesNotThrow(() => actions.handleDenodalizeGroup('group-1'));

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});
