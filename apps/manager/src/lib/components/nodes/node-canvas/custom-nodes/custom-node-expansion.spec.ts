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

const createExpansionHarness = (opts: {
  motherNode: NodeInstance;
  state: CustomNodeInstanceState;
  definition?: CustomNodeDefinition;
  expandedCustomByGroupId?: Map<string, { groupId: string; nodeId: string }>;
  forcedHiddenNodeIds?: Set<string>;
  mutations?: string[];
  onProjectionSync?: () => void;
}) => {
  const mutations = opts.mutations ?? [];
  const definition =
    opts.definition ?? {
      definitionId: opts.state.definitionId,
      name: 'Custom Node',
      template: { nodes: [], connections: [] },
      ports: [],
    };

  return createCustomNodeExpansion({
    expandedCustomByGroupId: opts.expandedCustomByGroupId ?? new Map(),
    forcedHiddenNodeIds: opts.forcedHiddenNodeIds ?? new Set(),
    nodeEngine: {
      getNode: (nodeId) => (nodeId === opts.motherNode.id ? opts.motherNode : null),
    },
    groupController: {
      scheduleHighlight: () => mutations.push('scheduleHighlight'),
    },
    requestFramesUpdate: () => mutations.push('requestFramesUpdate'),
    readCustomNodeState: () => opts.state,
    getCustomNodeDefinition: (definitionId) =>
      definitionId === definition.definitionId ? definition : null,
    syncEditorProjection: opts.onProjectionSync,
  });
};

test('handleExpandCustomNode tolerates non-object internal entries without mutating graph', () => {
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

  const mutations: string[] = [];
  const expansion = createExpansionHarness({ motherNode, state, mutations });

  assert.doesNotThrow(() => expansion.handleExpandCustomNode(motherNode.id));
  assert.deepEqual(mutations, ['scheduleHighlight', 'requestFramesUpdate']);
});

test('handleExpandCustomNode is a view-only action and does not mutate the engine graph', () => {
  const engineMutations: string[] = [];

  const motherNode: NodeInstance = {
    id: 'node-1',
    type: 'custom-node',
    position: { x: 10, y: 20 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  const internalGraph: GraphState = {
    nodes: [makeNode('inner-1')],
    connections: [
      {
        id: 'inner-c1',
        sourceNodeId: 'inner-1',
        sourcePortId: 'value',
        targetNodeId: 'inner-2',
        targetPortId: 'value',
      },
    ],
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
    template: internalGraph,
    ports: [],
  };

  const expandedCustomByGroupId = new Map<string, { groupId: string; nodeId: string }>();
  const expansion = createExpansionHarness({
    motherNode,
    state,
    definition: def,
    expandedCustomByGroupId,
  });

  expansion.handleExpandCustomNode(motherNode.id);

  assert.deepEqual(engineMutations, []);
  assert.deepEqual(expandedCustomByGroupId.get('group-1'), { groupId: 'group-1', nodeId: 'node-1' });
});

test('handleExpandCustomNode hides the collapsed mother node while its projection is expanded', () => {
  const motherNode: NodeInstance = {
    id: 'node-1',
    type: 'custom-node',
    position: { x: 10, y: 20 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const forcedHiddenNodeIds = new Set<string>();
  const expansion = createExpansionHarness({
    motherNode,
    forcedHiddenNodeIds,
    state: {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [makeNode('inner-1')], connections: [] },
    },
  });

  expansion.handleExpandCustomNode(motherNode.id);

  assert.equal(forcedHiddenNodeIds.has('node-1'), true);
});

test('handleCollapseCustomNodeFrame only clears expanded view state', () => {
  const engineMutations: string[] = [];
  let projectionSyncs = 0;
  const motherNode: NodeInstance = {
    id: 'node-1',
    type: 'custom-node',
    position: { x: 10, y: 20 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const expandedCustomByGroupId = new Map<string, { groupId: string; nodeId: string }>([
    ['group-1', { groupId: 'group-1', nodeId: 'node-1' }],
  ]);
  const state: CustomNodeInstanceState = {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [], connections: [] },
  };
  const expansion = createExpansionHarness({
    motherNode,
    state,
    expandedCustomByGroupId,
    onProjectionSync: () => {
      projectionSyncs += 1;
    },
  });

  expansion.handleCollapseCustomNodeFrame('group-1');

  assert.deepEqual(engineMutations, []);
  assert.equal(expandedCustomByGroupId.has('group-1'), false);
  assert.equal(projectionSyncs, 1);
});

test('handleCollapseCustomNodeFrame restores the collapsed mother node', () => {
  const motherNode: NodeInstance = {
    id: 'node-1',
    type: 'custom-node',
    position: { x: 10, y: 20 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const forcedHiddenNodeIds = new Set<string>(['node-1']);
  const expandedCustomByGroupId = new Map<string, { groupId: string; nodeId: string }>([
    ['group-1', { groupId: 'group-1', nodeId: 'node-1' }],
  ]);
  const expansion = createExpansionHarness({
    motherNode,
    expandedCustomByGroupId,
    forcedHiddenNodeIds,
    state: {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [], connections: [] },
    },
  });

  expansion.handleCollapseCustomNodeFrame('group-1');

  assert.equal(forcedHiddenNodeIds.has('node-1'), false);
});

test('rehydrateExpandedCustomFrames does not revive legacy materialized topology as expanded state', () => {
  const mutations: string[] = [];
  const expandedCustomByGroupId = new Map<string, { groupId: string; nodeId: string }>();

  const motherNode: NodeInstance = {
    id: 'mother-1',
    type: 'custom-node',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  const expansion = createExpansionHarness({
    motherNode,
    mutations,
    expandedCustomByGroupId,
    state: {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [], connections: [] },
    },
  });

  expansion.rehydrateExpandedCustomFrames({
    nodes: [
      motherNode,
      {
        id: 'cn:mother-1:inner-1',
        type: 'number',
        position: { x: 10, y: 20 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  });

  assert.deepEqual(mutations, []);
  assert.equal(expandedCustomByGroupId.size, 0);
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

test('handleNodelizeGroup captures ordinary nodes enclosed by the group frame even when membership lags', () => {
  const makeInstance = (
    id: string,
    type: string,
    position: { x: number; y: number },
    config: Record<string, unknown> = {}
  ): NodeInstance => ({
    id,
    type,
    position,
    config,
    inputValues: {},
    outputValues: {},
  });
  const nodes = new Map<string, NodeInstance>([
    ['button', makeInstance('button', 'client-button', { x: 80, y: 100 })],
    ['ui-out', makeInstance('ui-out', 'ui-out', { x: 260, y: 100 })],
    ['name', makeInstance('name', 'string', { x: 20, y: 20 }, { value: 'flag' })],
    ['setter', makeInstance('setter', 'set-boolean-variable', { x: 160, y: 20 })],
    ['getter', makeInstance('getter', 'get-boolean-variable', { x: 20, y: 180 })],
  ]);
  const connections: Connection[] = [
    { id: 'ui', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'ui-out', targetPortId: 'in' },
    { id: 'name-set', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
    { id: 'name-get', sourceNodeId: 'name', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
    { id: 'display', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'button', targetPortId: 'display' },
  ];
  const groupStore = writable([
    {
      id: 'group-1',
      parentId: null,
      name: 'Client UI Group',
      // This mimics the stale membership failure: the visible frame encloses
      // the variable helper nodes, but the group's nodeIds has not caught up.
      nodeIds: ['button', 'ui-out'],
      disabled: false,
      minimized: false,
    },
  ]);
  const definitions: CustomNodeDefinition[] = [];

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
      updateNodePosition: () => {},
      addNode: (node) => {
        nodes.set(node.id, node);
      },
      removeNode: (nodeId) => {
        nodes.delete(nodeId);
        for (let index = connections.length - 1; index >= 0; index -= 1) {
          const connection = connections[index];
          if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
            connections.splice(index, 1);
          }
        }
      },
      addConnection: (connection) => {
        connections.push(connection);
      },
      removeConnection: () => {},
    },
    nodeRegistry: {
      get: (type: string) => {
        if (type === 'client-button') {
          return {
            inputs: [{ id: 'display', label: 'Display', type: 'boolean' }],
            outputs: [{ id: 'out', label: 'Out', type: 'ui' }],
          };
        }
        if (type === 'ui-out') {
          return { inputs: [{ id: 'in', label: 'In', type: 'ui' }], outputs: [] };
        }
        if (type === 'string') {
          return { inputs: [], outputs: [{ id: 'value', label: 'Value', type: 'string' }] };
        }
        if (type === 'set-boolean-variable') {
          return { inputs: [{ id: 'name', label: 'Name', type: 'string' }], outputs: [] };
        }
        if (type === 'get-boolean-variable') {
          return {
            inputs: [{ id: 'name', label: 'Name', type: 'string' }],
            outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
          };
        }
        return null;
      },
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
    groupFrames: writable([
      {
        group: { id: 'group-1' },
        left: 0,
        top: 0,
        width: 420,
        height: 320,
      } as never,
    ]),
    viewAdapter: {
      getNodePosition: (nodeId) => nodes.get(nodeId)?.position ?? null,
    },
    buildGroupPortIndex: () => new Map([['group-1', { proxyIds: [], legacyActivateIds: [] }]]),
    groupIdFromNode: () => null,
    customNodeType: (definitionId) => `custom:${definitionId}`,
    addCustomNodeDefinition: (definition) => definitions.push(definition),
    upsertCustomNodeDefinitionCommand: () => {},
    replaceSemanticGraphCommand: () => {},
    removeCustomNodeDefinition: () => {},
    getCustomNodeDefinition: () => null,
    readCustomNodeState: () => null,
    writeCustomNodeState: (config, state) => ({ ...config, customNode: state }),
    expandedCustomByGroupId: new Map(),
    forcedHiddenNodeIds: new Set(),
    refreshExpandedCustomGroupIds: () => {},
    requestFramesUpdate: () => {},
    setSelectedNode: () => {},
  });

  actions.handleNodelizeGroup('group-1');

  const internalTypes = definitions[0]?.template.nodes.map((node) => String(node.type)).sort();
  assert.deepEqual(
    internalTypes,
    ['client-button', 'get-boolean-variable', 'set-boolean-variable', 'string', 'ui-out'].sort()
  );

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});

test('handleNodelizeGroup preserves descendant groups and their gate nodes inside the custom template', () => {
  const makeInstance = (
    id: string,
    type: string,
    position: { x: number; y: number },
    config: Record<string, unknown> = {}
  ): NodeInstance => ({
    id,
    type,
    position,
    config,
    inputValues: {},
    outputValues: {},
  });
  const nodes = new Map<string, NodeInstance>([
    ['outer-proxy', makeInstance('outer-proxy', 'group-proxy', { x: -40, y: 100 }, { groupId: 'outer', direction: 'input', portType: 'boolean' })],
    ['inner-gate', makeInstance('inner-gate', 'group-gate', { x: 70, y: 80 }, { groupId: 'inner' })],
    ['inner-node', makeInstance('inner-node', 'client-button', { x: 140, y: 120 })],
    ['outer-node', makeInstance('outer-node', 'ui-out', { x: 320, y: 120 })],
  ]);
  const connections: Connection[] = [
    { id: 'proxy-to-gate', sourceNodeId: 'outer-proxy', sourcePortId: 'out', targetNodeId: 'inner-gate', targetPortId: 'active' },
    { id: 'inner-to-outer', sourceNodeId: 'inner-node', sourcePortId: 'out', targetNodeId: 'outer-node', targetPortId: 'in' },
  ];
  const groupStore = writable([
    {
      id: 'outer',
      parentId: null,
      name: 'Outer',
      nodeIds: ['outer-proxy', 'inner-gate', 'inner-node', 'outer-node'],
      disabled: false,
      minimized: false,
    },
    {
      id: 'inner',
      parentId: 'outer',
      name: 'Inner',
      nodeIds: ['inner-node'],
      disabled: false,
      minimized: false,
      runtimeActive: false,
    },
  ]);
  const definitions: CustomNodeDefinition[] = [];
  let motherConfig: Record<string, unknown> | null = null;

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
      updateNodePosition: () => {},
      addNode: (node) => {
        nodes.set(node.id, node);
        motherConfig = node.config ?? {};
      },
      removeNode: (nodeId) => {
        nodes.delete(nodeId);
        for (let index = connections.length - 1; index >= 0; index -= 1) {
          const connection = connections[index];
          if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
            connections.splice(index, 1);
          }
        }
      },
      addConnection: (connection) => {
        connections.push(connection);
      },
      removeConnection: () => {},
    },
    nodeRegistry: {
      get: (type: string) => {
        if (type === 'client-button') {
          return {
            inputs: [],
            outputs: [{ id: 'out', label: 'Out', type: 'ui' }],
          };
        }
        if (type === 'ui-out') {
          return { inputs: [{ id: 'in', label: 'In', type: 'ui' }], outputs: [] };
        }
        return null;
      },
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
    groupFrames: writable([{ group: { id: 'outer' }, left: 0, top: 0, width: 420, height: 260 } as never]),
    viewAdapter: {
      getNodePosition: (nodeId) => nodes.get(nodeId)?.position ?? null,
    },
    buildGroupPortIndex: () =>
      new Map([
        ['outer', { proxyIds: ['outer-proxy'], legacyActivateIds: [] }],
        ['inner', { gateId: 'inner-gate', proxyIds: [], legacyActivateIds: [] }],
      ]),
    groupIdFromNode: (node) => String(node.config?.groupId ?? '') || null,
    customNodeType: (definitionId) => `custom:${definitionId}`,
    addCustomNodeDefinition: (definition) => definitions.push(definition),
    upsertCustomNodeDefinitionCommand: () => {},
    replaceSemanticGraphCommand: () => {},
    removeCustomNodeDefinition: () => {},
    getCustomNodeDefinition: () => null,
    readCustomNodeState: () => null,
    writeCustomNodeState: (config, state) => ({ ...config, customNode: state }),
    expandedCustomByGroupId: new Map(),
    forcedHiddenNodeIds: new Set(),
    refreshExpandedCustomGroupIds: () => {},
    requestFramesUpdate: () => {},
    setSelectedNode: () => {},
  });

  actions.handleNodelizeGroup('outer');

  const template = definitions[0]?.template;
  assert.ok(template);
  assert.deepEqual(template.groups, [
    {
      id: 'inner',
      parentId: null,
      name: 'Inner',
      nodeIds: ['inner-node'],
      disabled: false,
      minimized: false,
    },
  ]);
  assert.ok(template.nodes.some((node) => node.id === 'inner-gate' && node.type === 'group-gate'));
  assert.ok(
    template.connections.some(
      (connection) =>
        connection.sourceNodeId === 'outer-proxy' &&
        connection.targetNodeId === 'inner-gate' &&
        connection.targetPortId === 'active'
    )
  );
  assert.deepEqual((motherConfig?.customNode as CustomNodeInstanceState | undefined)?.internal.groups, template.groups);

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});

test('handleNodelizeGroup repairs descendant group membership from the visible frame before saving the template', () => {
  const makeInstance = (
    id: string,
    type: string,
    position: { x: number; y: number },
    config: Record<string, unknown> = {}
  ): NodeInstance => ({
    id,
    type,
    position,
    config,
    inputValues: {},
    outputValues: {},
  });
  const nodes = new Map<string, NodeInstance>([
    ['inner-gate', makeInstance('inner-gate', 'group-gate', { x: 40, y: 40 }, { groupId: 'inner' })],
    ['setter', makeInstance('setter', 'set-boolean-variable', { x: 120, y: 80 })],
    ['getter', makeInstance('getter', 'get-boolean-variable', { x: 120, y: 170 })],
    ['string', makeInstance('string', 'string', { x: 20, y: 120 }, { value: 'flag' })],
    ['button', makeInstance('button', 'client-button', { x: 340, y: 120 })],
  ]);
  const connections: Connection[] = [
    { id: 'name-set', sourceNodeId: 'string', sourcePortId: 'value', targetNodeId: 'setter', targetPortId: 'name' },
    { id: 'name-get', sourceNodeId: 'string', sourcePortId: 'value', targetNodeId: 'getter', targetPortId: 'name' },
    { id: 'get-gate', sourceNodeId: 'getter', sourcePortId: 'value', targetNodeId: 'inner-gate', targetPortId: 'active' },
  ];
  const groupStore = writable([
    {
      id: 'outer',
      parentId: null,
      name: 'Outer',
      nodeIds: ['inner-gate', 'setter', 'getter', 'string', 'button'],
      disabled: false,
      minimized: false,
    },
    {
      id: 'inner',
      parentId: 'outer',
      name: 'Inner',
      // This mirrors the regression in imported/nodelized graphs: the visual
      // frame encloses the getter, but persisted membership only contains the setter.
      nodeIds: ['setter'],
      disabled: false,
      minimized: false,
    },
  ]);
  const definitions: CustomNodeDefinition[] = [];

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
      updateNodePosition: () => {},
      addNode: (node) => {
        nodes.set(node.id, node);
      },
      removeNode: (nodeId) => {
        nodes.delete(nodeId);
        for (let index = connections.length - 1; index >= 0; index -= 1) {
          const connection = connections[index];
          if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
            connections.splice(index, 1);
          }
        }
      },
      addConnection: (connection) => {
        connections.push(connection);
      },
      removeConnection: () => {},
    },
    nodeRegistry: {
      get: () => null,
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
    groupFrames: writable([
      { group: { id: 'outer' }, left: 0, top: 0, width: 420, height: 300 } as never,
      { group: { id: 'inner' }, left: 0, top: 40, width: 280, height: 220 } as never,
    ]),
    viewAdapter: {
      getNodePosition: (nodeId) => nodes.get(nodeId)?.position ?? null,
    },
    buildGroupPortIndex: () =>
      new Map([
        ['outer', { proxyIds: [], legacyActivateIds: [] }],
        ['inner', { gateId: 'inner-gate', proxyIds: [], legacyActivateIds: [] }],
      ]),
    groupIdFromNode: (node) => String(node.config?.groupId ?? '') || null,
    customNodeType: (definitionId) => `custom:${definitionId}`,
    addCustomNodeDefinition: (definition) => definitions.push(definition),
    upsertCustomNodeDefinitionCommand: () => {},
    replaceSemanticGraphCommand: () => {},
    removeCustomNodeDefinition: () => {},
    getCustomNodeDefinition: () => null,
    readCustomNodeState: () => null,
    writeCustomNodeState: (config, state) => ({ ...config, customNode: state }),
    expandedCustomByGroupId: new Map(),
    forcedHiddenNodeIds: new Set(),
    refreshExpandedCustomGroupIds: () => {},
    requestFramesUpdate: () => {},
    setSelectedNode: () => {},
  });

  actions.handleNodelizeGroup('outer');

  const templateGroup = definitions[0]?.template.groups?.find((item) => item.id === 'inner');
  assert.ok(templateGroup);
  assert.deepEqual([...templateGroup.nodeIds].sort(), ['getter', 'setter', 'string'].sort());

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
  } else {
    delete (globalThis as typeof globalThis & { confirm?: () => boolean }).confirm;
  }
});
