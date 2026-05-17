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

test('handleDenodelizeGroup ignores non-object graph nodes', () => {
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

  assert.doesNotThrow(() => actions.handleDenodelizeGroup('group-1'));

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});

test('handleNodelizeGroup publishes the post-nodelization graph to server authority', () => {
  const nodes = new Map<string, NodeInstance>([
    [
      'inner-number',
      {
        id: 'inner-number',
        type: 'number',
        position: { x: 40, y: 60 },
        config: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    ],
  ]);
  const connections: Connection[] = [];
  const groupStore = writable([
    {
      id: 'group-1',
      parentId: null,
      name: 'Pulse Group',
      nodeIds: ['inner-number'],
      disabled: false,
      minimized: false,
    },
  ]);
  const semanticReplacements: Array<{ graph: GraphState; groups: unknown[] }> = [];

  const originalConfirm = globalThis.confirm;
  (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm = () => true;

  const actions = createCustomNodeActions({
    nodeEngine: {
      getNode: (nodeId) => nodes.get(nodeId) ?? null,
      exportGraph: () => ({
        nodes: Array.from(nodes.values()).map((node) => ({ ...node })),
        connections: [...connections],
      }),
      updateNodeType: () => {},
      updateNodeConfig: () => {},
      updateNodeInputValue: () => {},
      updateNodePosition: (nodeId, pos) => {
        const node = nodes.get(nodeId);
        if (node) nodes.set(nodeId, { ...node, position: pos });
      },
      addNode: (node) => {
        nodes.set(node.id, node);
      },
      removeNode: (nodeId) => {
        nodes.delete(nodeId);
      },
      addConnection: (connection) => {
        connections.push(connection);
      },
      removeConnection: (connectionId) => {
        const index = connections.findIndex((connection) => connection.id === connectionId);
        if (index >= 0) connections.splice(index, 1);
      },
    },
    nodeRegistry: {
      get: (type: string) =>
        type === 'number'
          ? {
              inputs: [{ id: 'value', label: 'Value', type: 'number' }],
              outputs: [{ id: 'value', label: 'Value', type: 'number' }],
            }
          : null,
    } as NodeRegistry,
    groupController: {
      nodeGroups: groupStore,
      setGroups: (groups) => groupStore.set(groups),
      disassembleGroup: (groupId) =>
        groupStore.update((groups) => groups.filter((group) => group.id !== groupId)),
      scheduleHighlight: () => {},
    },
    groupPortNodesController: {
      ensureGroupPortNodes: () => {},
      disassembleGroupAndPorts: () => {},
      scheduleNormalizeProxies: () => {},
    },
    groupFrames: writable([{ group: { id: 'group-1' }, left: 20, top: 30 } as never]),
    viewAdapter: {
      getNodePosition: (nodeId) => nodes.get(nodeId)?.position ?? null,
    },
    buildGroupPortIndex: () => new Map([['group-1', { proxyIds: [], legacyActivateIds: [] }]]),
    groupIdFromNode: () => null,
    customNodeType: (definitionId) => `custom:${definitionId}`,
    addCustomNodeDefinition: () => {},
    upsertCustomNodeDefinitionCommand: () => {},
    replaceSemanticGraphCommand: (state) => semanticReplacements.push(state),
    removeCustomNodeDefinition: () => {},
    getCustomNodeDefinition: () => null,
    readCustomNodeState: () => null,
    writeCustomNodeState: (config, state) => ({ ...config, __customNode: state }),
    expandedCustomByGroupId: new Map(),
    forcedHiddenNodeIds: new Set(),
    refreshExpandedCustomGroupIds: () => {},
    requestFramesUpdate: () => {},
    setSelectedNode: () => {},
  });

  actions.handleNodelizeGroup('group-1');

  assert.equal(semanticReplacements.length, 1);
  assert.equal(semanticReplacements[0]?.graph.nodes.length, 1);
  assert.match(String(semanticReplacements[0]?.graph.nodes[0]?.type), /^custom:/);
  assert.deepEqual(semanticReplacements[0]?.groups, []);

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});
