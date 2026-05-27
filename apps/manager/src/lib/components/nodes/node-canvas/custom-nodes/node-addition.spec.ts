// Purpose: Verify add-node commands write into expanded Custom Node projections when appropriate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { createNodeAdder } from './node-addition';
import { cloneInternalGraphForNewInstance } from '$lib/nodes/custom-nodes/instance';

function readTestCustomNodeState(config: Record<string, unknown>): any {
  return (config.customNode as any) ?? null;
}

function writeTestCustomNodeState(config: Record<string, unknown>, state: Record<string, unknown>) {
  return { ...config, customNode: state };
}

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
    cloneInternalGraphForNewInstance,
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
    expandedCustomByGroupId: new Map([
      ['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }],
    ]),
    isExpandedCustomEditable: (groupId) => groupId === 'group:expanded',
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

test('createNodeAdder leaves expanded custom nodes read-only until explicitly editable', () => {
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
    cloneInternalGraphForNewInstance,
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
    expandedCustomByGroupId: new Map([
      ['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }],
    ]),
    isExpandedCustomEditable: () => false,
    getNodeCount: () => 0,
    generateId: () => 'node-new',
    addNodeCommand: (node) => addedCanonical.push(node),
    addProjectionNodeCommand: (_ownerNodeId, node) => {
      addedProjection.push(node);
      return `view:custom:custom-1:${node.id}`;
    },
  });

  const nodeId = addNode('float', { x: 160, y: 180 });

  assert.equal(nodeId, 'node-new');
  assert.equal(addedCanonical.length, 1);
  assert.deepEqual(addedProjection, []);
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
    expandedCustomByGroupId: new Map([
      ['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }],
    ]),
    isExpandedCustomEditable: (groupId) => groupId === 'group:expanded',
    getNodeCount: () => 0,
    generateId: () => 'proxy-new',
    addNodeCommand: (node) => addedCanonical.push(node),
    addProjectionNodeCommand: (ownerNodeId, node) => {
      assert.equal(ownerNodeId, 'custom-1');
      addedProjection.push(node);
      return `view:custom:${ownerNodeId}:${node.id}`;
    },
  });

  const nodeId = addNode(
    'group-proxy',
    { x: 64, y: 180 },
    { groupId: 'group:expanded', direction: 'input' }
  );

  assert.equal(nodeId, 'view:custom:custom-1:proxy-new');
  assert.deepEqual(addedCanonical, []);
  assert.equal(addedProjection.length, 1);
  assert.deepEqual(addedProjection[0]?.config, { groupId: 'group:expanded', direction: 'input' });
});

test('createNodeAdder ignores expanded custom groupId hints while read-only', () => {
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
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map([
      ['group:expanded', { groupId: 'group:expanded', nodeId: 'custom-1' }],
    ]),
    isExpandedCustomEditable: () => false,
    getNodeCount: () => 0,
    generateId: () => 'proxy-new',
    addNodeCommand: (node) => addedCanonical.push(node),
    addProjectionNodeCommand: (_ownerNodeId, node) => {
      addedProjection.push(node);
      return `view:custom:custom-1:${node.id}`;
    },
  });

  const nodeId = addNode(
    'group-proxy',
    { x: 64, y: 180 },
    { groupId: 'group:expanded', direction: 'input' }
  );

  assert.equal(nodeId, 'proxy-new');
  assert.equal(addedCanonical.length, 1);
  assert.deepEqual(addedProjection, []);
});

test('createNodeAdder assigns unique default variable names for boolean variable nodes', () => {
  const added: NodeInstance[] = [];
  const ids = ['set-a', 'get-a', 'set-b'];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({
        configSchema: [
          { key: 'name', defaultValue: 'variable' },
          { key: 'defaultValue', defaultValue: false },
        ],
      }),
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
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map(),
    getGraphState: () => ({ nodes: added, connections: [] }),
    getNodeCount: () => added.length,
    generateId: () => ids[added.length] ?? `node-${added.length}`,
    addNodeCommand: (node) => added.push(node),
  });

  addNode('set-boolean-variable');
  addNode('get-boolean-variable');
  addNode('set-boolean-variable');

  assert.deepEqual(
    added.map((node) => node.config.name),
    ['variable', 'variable_1', 'variable_2']
  );
});

test('createNodeAdder assigns unique immutable names for independent variable name nodes', () => {
  const added: NodeInstance[] = [
    {
      id: 'existing-set',
      type: 'set-boolean-variable',
      position: { x: 0, y: 0 },
      config: { name: 'variable' },
      inputValues: {},
      outputValues: {},
    },
    {
      id: 'existing-independent',
      type: 'independent-variable-name',
      position: { x: 0, y: 0 },
      config: { name: 'variable_1' },
      inputValues: {},
      outputValues: {},
    },
  ];
  const ids = ['independent-a', 'independent-b'];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({
        configSchema: [],
      }),
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
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map(),
    getGraphState: () => ({ nodes: added, connections: [] }),
    getNodeCount: () => added.length,
    generateId: () => ids[added.length - 2] ?? `node-${added.length}`,
    addNodeCommand: (node) => added.push(node),
  });

  addNode('independent-variable-name');
  addNode('independent-variable-name');

  assert.deepEqual(
    added.slice(2).map((node) => node.config.name),
    ['variable_2', 'variable_3']
  );
});

test('createNodeAdder creates custom children from the current mother graph with fresh independent names', () => {
  const staleTemplate: GraphState = {
    nodes: [
      {
        id: 'name',
        type: 'independent-variable-name',
        position: { x: 0, y: 0 },
        config: { name: 'variable_2' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };
  const currentMotherInternal: GraphState = {
    nodes: [
      ...staleTemplate.nodes,
      {
        id: 'name-port',
        type: 'group-proxy',
        position: { x: 200, y: 0 },
        config: { groupId: 'group:mother', direction: 'output', portType: 'string', pinned: true },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'name-to-port',
        sourceNodeId: 'name',
        sourcePortId: 'value',
        targetNodeId: 'name-port',
        targetPortId: 'in',
      },
    ],
  };
  const added: NodeInstance[] = [
    {
      id: 'mother',
      type: 'custom:def-1',
      position: { x: 0, y: 0 },
      config: writeTestCustomNodeState(
        {},
        {
          definitionId: 'def-1',
          groupId: 'group:mother',
          role: 'mother',
          manualGate: true,
          internal: currentMotherInternal,
        }
      ),
      inputValues: {},
      outputValues: {},
    },
  ];
  const groupIds = ['group:child-1', 'group:child-2'];
  const ids = ['child-1', 'child-2'];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({ configSchema: [] }),
    },
    nodeEngine: {
      getNode: (id) => added.find((node) => node.id === id),
    },
    customNodeTypePrefix: 'custom:',
    getCustomNodeDefinition: () => ({
      template: staleTemplate,
    }),
    cloneInternalGraphForNewInstance: (graph, groupId) => ({
      nodes: graph.nodes.map((node) => ({
        ...node,
        config:
          node.type === 'group-proxy' || node.type === 'group-gate'
            ? { ...(node.config ?? {}), groupId }
            : { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      })),
      connections: graph.connections.map((connection) => ({ ...connection })),
    }),
    generateCustomNodeGroupId: () => groupIds[added.length - 1] ?? `group:child-${added.length}`,
    readCustomNodeState: readTestCustomNodeState,
    writeCustomNodeState: writeTestCustomNodeState,
    customNodeDefinitions: writable([]),
    wouldCreateCycle: () => false,
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map(),
    getGraphState: () => ({ nodes: added, connections: [] }),
    getNodeCount: () => added.length,
    generateId: () => ids[added.length - 1] ?? `child-${added.length}`,
    addNodeCommand: (node) => added.push(node),
  });

  addNode('custom:def-1');
  addNode('custom:def-1');

  const childStates = added.slice(1).map((node) => readTestCustomNodeState(node.config));
  assert.deepEqual(
    childStates.map((state) =>
      state.internal.nodes.find((node: NodeInstance) => node.type === 'independent-variable-name')
        ?.config.name
    ),
    ['variable_2_1', 'variable_2_2']
  );
  for (const state of childStates) {
    assert.ok(
      state.internal.nodes.some((node: NodeInstance) => node.id === 'name-port'),
      'child custom nodes should clone the current mother internal graph instead of stale definition template'
    );
  }
});

test('createNodeAdder preserves internal group gate ids when cloning custom children', () => {
  const template: GraphState = {
    nodes: [
      {
        id: 'gate',
        type: 'group-gate',
        position: { x: 0, y: 0 },
        config: { groupId: 'group:inner' },
        inputValues: { active: true },
        outputValues: {},
      },
      {
        id: 'proxy',
        type: 'group-proxy',
        position: { x: 0, y: 120 },
        config: { groupId: 'group:inner', direction: 'input', portType: 'string', pinned: true },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
    groups: [
      {
        id: 'group:inner',
        parentId: null,
        name: 'Inner',
        nodeIds: ['gate', 'proxy'],
        disabled: false,
        minimized: false,
      },
    ],
  };
  const added: NodeInstance[] = [];
  const addNode = createNodeAdder({
    nodeRegistry: {
      get: () => ({ configSchema: [] }),
    },
    nodeEngine: {
      getNode: (id) => added.find((node) => node.id === id),
    },
    customNodeTypePrefix: 'custom:',
    getCustomNodeDefinition: () => ({
      template,
    }),
    cloneInternalGraphForNewInstance,
    generateCustomNodeGroupId: () => 'group:custom-instance',
    readCustomNodeState: readTestCustomNodeState,
    writeCustomNodeState: writeTestCustomNodeState,
    customNodeDefinitions: writable([]),
    wouldCreateCycle: () => false,
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map(),
    getGraphState: () => ({ nodes: added, connections: [] }),
    getNodeCount: () => added.length,
    generateId: () => 'child',
    addNodeCommand: (node) => added.push(node),
  });

  addNode('custom:def-1');

  const state = readTestCustomNodeState(added[0]!.config);
  assert.equal(
    state.internal.nodes.find((node: NodeInstance) => node.id === 'gate')?.config.groupId,
    'group:inner'
  );
  assert.equal(
    state.internal.nodes.find((node: NodeInstance) => node.id === 'proxy')?.config.groupId,
    'group:inner'
  );
});

test('createNodeAdder does not return a node id when semantic add rejects the node', () => {
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
    getGroupFrames: () => [],
    expandedCustomByGroupId: new Map(),
    getNodeCount: () => 0,
    generateId: () => 'node-rejected',
    addNodeCommand: () => false,
  });

  assert.equal(addNode('pulse-to-boolean'), undefined);
});
