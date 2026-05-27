// Purpose: Verify editor-only Custom Node projection graphs stay distinct from canonical graph ids.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import {
  appendCustomNodeProjectionConnection,
  appendCustomNodeProjectionNode,
  buildCustomNodeProjectionGraph,
  customNodeInternalGroupIdForProjection,
  isCustomNodeProjectionId,
  parseCustomNodeProjectionNodeId,
  refreshCustomNodeProjectionPorts,
  removeCustomNodeProjectionNode,
  resolveCustomNodeProjectionPublicConnection,
  translateCustomNodeProjectionNodePosition,
  upsertCustomNodeProjectionPort,
  writeCustomNodeProjectionValue,
} from './custom-node-projection';

test('buildCustomNodeProjectionGraph creates view-prefixed nodes and connections', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: {
      nodes: [
        {
          id: 'inner-a',
          type: 'number',
          position: { x: 10, y: 20 },
          config: { value: 1 },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inner-b',
          type: 'number',
          position: { x: 30, y: 40 },
          config: { value: 2 },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'inner-c',
          sourceNodeId: 'inner-a',
          sourcePortId: 'value',
          targetNodeId: 'inner-b',
          targetPortId: 'value',
        },
      ],
    },
    ports: [],
  };
  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group-1',
    role: 'mother',
    manualGate: true,
    internal: definition.template,
  };

  const projection = buildCustomNodeProjectionGraph({ customNode, state, definition });

  assert.equal(projection.nodes.length, 2);
  assert.ok(projection.nodes.every((node) => isCustomNodeProjectionId(String(node.id))));
  assert.equal(projection.nodes[0].position.x, 110);
  assert.equal(projection.nodes[0].position.y, 220);
  assert.deepEqual(projection.nodes[0].config.editorProjection, true);
  assert.equal(projection.connections.length, 1);
  assert.ok(isCustomNodeProjectionId(String(projection.connections[0].sourceNodeId)));
  assert.ok(isCustomNodeProjectionId(String(projection.connections[0].targetNodeId)));
});

test('buildCustomNodeProjectionGraph projects internal custom-node group metadata', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: {
      nodes: [
        {
          id: 'inner-a',
          type: 'number',
          position: { x: 10, y: 20 },
          config: {},
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
          nodeIds: ['inner-a'],
          disabled: false,
          minimized: false,
          runtimeActive: false,
        },
      ],
    },
    ports: [],
  };
  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group:owner',
    role: 'mother',
    manualGate: true,
    internal: definition.template,
  };

  const projection = buildCustomNodeProjectionGraph({ customNode, state, definition });

  assert.deepEqual(projection.groups, [
    {
      id: 'view:custom:custom-1:group:group:inner',
      parentId: null,
      name: 'Inner',
      nodeIds: ['view:custom:custom-1:inner-a'],
      disabled: false,
      minimized: false,
    },
  ]);
  assert.equal(
    projection.nodes[0].config.groupId,
    undefined
  );
});

test('buildCustomNodeProjectionGraph projects group decoration config group ids to view ids', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: {
      nodes: [
        {
          id: 'proxy',
          type: 'group-proxy',
          position: { x: 10, y: 20 },
          config: { groupId: 'group:inner', direction: 'input', portType: 'boolean' },
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
          nodeIds: ['proxy'],
          disabled: false,
          minimized: false,
        },
      ],
    },
    ports: [],
  };
  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group:owner',
    role: 'mother',
    manualGate: true,
    internal: definition.template,
  };

  const projection = buildCustomNodeProjectionGraph({ customNode, state, definition });

  assert.equal(
    projection.nodes[0].config.groupId,
    'view:custom:custom-1:group:group:inner'
  );
  assert.equal(
    customNodeInternalGroupIdForProjection('custom-1', String(projection.nodes[0].config.groupId)),
    'group:inner'
  );
});

test('parseCustomNodeProjectionNodeId returns owner and internal ids', () => {
  assert.deepEqual(parseCustomNodeProjectionNodeId('view:custom:custom-1:input-proxy'), {
    customNodeId: 'custom-1',
    internalNodeId: 'input-proxy',
  });
  assert.equal(parseCustomNodeProjectionNodeId('plain-node'), null);
});

test('buildCustomNodeProjectionGraph projects external custom-node wiring to internal port bindings', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: {
      nodes: [
        {
          id: 'input-proxy',
          type: 'group-proxy',
          position: { x: -24, y: 80 },
          config: { direction: 'input', portType: 'number' },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inner',
          type: 'number',
          position: { x: 40, y: 80 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'inner-c',
          sourceNodeId: 'input-proxy',
          sourcePortId: 'out',
          targetNodeId: 'inner',
          targetPortId: 'value',
        },
      ],
    },
    ports: [
      {
        portKey: 'brightness',
        label: 'Brightness',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 80,
        binding: { nodeId: 'input-proxy', portId: 'in' },
      },
    ],
  };
  const state: CustomNodeInstanceState = {
    definitionId: 'def-1',
    groupId: 'group-1',
    role: 'mother',
    manualGate: true,
    internal: definition.template,
  };

  const projection = buildCustomNodeProjectionGraph({
    customNode,
    state,
    definition,
    externalConnections: [
      {
        id: 'external-c',
        sourceNodeId: 'source-1',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'brightness',
      },
    ],
  });

  assert.ok(
    projection.connections.some(
      (connection) =>
        connection.sourceNodeId === 'source-1' &&
        connection.sourcePortId === 'value' &&
        connection.targetNodeId === 'view:custom:custom-1:input-proxy' &&
        connection.targetPortId === 'in'
    )
  );
});

test('resolveCustomNodeProjectionPublicConnection maps external source to custom input port', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: { nodes: [], connections: [] },
    ports: [
      {
        portKey: 'brightness',
        label: 'Brightness',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'input-proxy', portId: 'in' },
      },
    ],
  };

  const canonical = resolveCustomNodeProjectionPublicConnection({
    customNode,
    definition,
    createConnectionId: () => 'canonical-c',
    connection: {
      id: 'view-c',
      sourceNodeId: 'source-1',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:input-proxy',
      targetPortId: 'in',
    },
  });

  assert.deepEqual(canonical, {
    id: 'canonical-c',
    sourceNodeId: 'source-1',
    sourcePortId: 'value',
    targetNodeId: 'custom-1',
    targetPortId: 'brightness',
  });
});

test('resolveCustomNodeProjectionPublicConnection maps custom output binding to external target', () => {
  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: { nodes: [], connections: [] },
    ports: [
      {
        portKey: 'imageOut',
        label: 'Image Out',
        side: 'output',
        type: 'image',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner-image', portId: 'value' },
      },
    ],
  };

  const canonical = resolveCustomNodeProjectionPublicConnection({
    customNode,
    definition,
    createConnectionId: () => 'canonical-c',
    connection: {
      id: 'view-c',
      sourceNodeId: 'view:custom:custom-1:inner-image',
      sourcePortId: 'value',
      targetNodeId: 'target-1',
      targetPortId: 'image',
    },
  });

  assert.deepEqual(canonical, {
    id: 'canonical-c',
    sourceNodeId: 'custom-1',
    sourcePortId: 'imageOut',
    targetNodeId: 'target-1',
    targetPortId: 'image',
  });
});

test('writeCustomNodeProjectionValue patches the owner internal graph through semantic params', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'inner',
              type: 'number',
              position: { x: 0, y: 0 },
              config: { value: 1 },
              inputValues: { value: 1 },
              outputValues: {},
            },
          ],
          connections: [],
          groups: [
            {
              id: 'group:inner',
              parentId: null,
              name: 'Inner',
              nodeIds: ['inner'],
              disabled: false,
              minimized: false,
            },
          ],
        },
      },
    },
    inputValues: { gate: true },
    outputValues: {},
  };
  const configUpdates: unknown[] = [];
  const semanticParams: unknown[] = [];
  const overrides: unknown[] = [];

  const ok = writeCustomNodeProjectionValue({
    projectionNodeId: 'view:custom:custom-1:inner',
    kind: 'config',
    key: 'value',
    value: 7,
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => configUpdates.push({ nodeId, config }),
    sendSemanticNodeParams: (nodeId, params) => {
      semanticParams.push({ nodeId, params });
      return true;
    },
    sendNodeOverride: (nodeId, kind, portId, value) => {
      overrides.push({ nodeId, kind, portId, value });
    },
  });

  assert.equal(ok, true);
  assert.equal(
    (
      (configUpdates[0] as { config?: { customNode?: { internal?: { nodes?: NodeInstance[] } } } })
        ?.config?.customNode?.internal?.nodes?.[0]?.config as Record<string, unknown>
    )?.value,
    7
  );
  assert.deepEqual(
    (semanticParams[0] as { nodeId?: string; params?: unknown } | undefined)?.nodeId,
    'custom-1'
  );
  assert.deepEqual(
    (semanticParams[0] as { params?: unknown } | undefined)?.params,
    (configUpdates[0] as { config?: unknown } | undefined)?.config
  );
  assert.deepEqual(overrides, [
    { nodeId: 'cn:custom-1:inner', kind: 'config', portId: 'value', value: 7 },
  ]);
});

test('writeCustomNodeProjectionValue preserves internal groups while patching a projected node', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'inner',
              type: 'number',
              position: { x: 0, y: 0 },
              config: { value: 1 },
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
              nodeIds: ['inner'],
              disabled: false,
              minimized: false,
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const ok = writeCustomNodeProjectionValue({
    projectionNodeId: 'view:custom:custom-1:inner',
    kind: 'config',
    key: 'value',
    value: 3,
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.equal(ok, true);
  assert.deepEqual(updates[0]?.config.customNode?.internal?.groups, [
    {
      id: 'group:inner',
      parentId: null,
      name: 'Inner',
      nodeIds: ['inner'],
      disabled: false,
      minimized: false,
    },
  ]);
});

test('appendCustomNodeProjectionNode inserts a node into owner internal graph with relative position', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const projectionId = appendCustomNodeProjectionNode({
    ownerNodeId: 'custom-1',
    node: {
      id: 'inner-new',
      type: 'float',
      position: { x: 160, y: 260 },
      config: { value: 1.5 },
      inputValues: {},
      outputValues: {},
    },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.equal(projectionId, 'view:custom:custom-1:inner-new');
  const nodes = updates[0]?.config.customNode?.internal?.nodes as NodeInstance[] | undefined;
  assert.equal(nodes?.length, 1);
  assert.deepEqual(nodes?.[0]?.position, { x: 60, y: 60 });
});

test('appendCustomNodeProjectionNode can use the current owner view position as relative origin', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  appendCustomNodeProjectionNode({
    ownerNodeId: 'custom-1',
    node: {
      id: 'inner-new',
      type: 'float',
      position: { x: 560, y: 760 },
      config: { value: 1.5 },
      inputValues: {},
      outputValues: {},
    },
    ownerViewPosition: { x: 500, y: 700 },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  const nodes = updates[0]?.config.customNode?.internal?.nodes as NodeInstance[] | undefined;
  assert.deepEqual(nodes?.[0]?.position, { x: 60, y: 60 });
});

test('appendCustomNodeProjectionNode preserves existing internal groups', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [],
          connections: [],
          groups: [
            {
              id: 'group:inner',
              parentId: null,
              name: 'Inner',
              nodeIds: [],
              disabled: false,
              minimized: false,
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  appendCustomNodeProjectionNode({
    ownerNodeId: 'custom-1',
    node: {
      id: 'inner-new',
      type: 'float',
      position: { x: 160, y: 260 },
      config: {},
      inputValues: {},
      outputValues: {},
    },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.deepEqual(updates[0]?.config.customNode?.internal?.groups, [
    {
      id: 'group:inner',
      parentId: null,
      name: 'Inner',
      nodeIds: [],
      disabled: false,
      minimized: false,
    },
  ]);
});

test('appendCustomNodeProjectionNode writes projection group ids back as internal group ids', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group:owner',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [],
          connections: [],
          groups: [
            {
              id: 'group:inner',
              parentId: null,
              name: 'Inner',
              nodeIds: [],
              disabled: false,
              minimized: false,
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  appendCustomNodeProjectionNode({
    ownerNodeId: 'custom-1',
    node: {
      id: 'proxy-new',
      type: 'group-proxy',
      position: { x: 160, y: 260 },
      config: {
        groupId: 'view:custom:custom-1:group:group:inner',
        direction: 'input',
        portType: 'boolean',
      },
      inputValues: {},
      outputValues: {},
    },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  const nodes = updates[0]?.config.customNode?.internal?.nodes as NodeInstance[] | undefined;
  assert.equal(nodes?.[0]?.config.groupId, 'group:inner');
});

test('removeCustomNodeProjectionNode deletes internal node, connections, and group membership', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group:owner',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            { id: 'a', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
            { id: 'b', type: 'number', position: { x: 100, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
          ],
          connections: [{ id: 'c1', sourceNodeId: 'a', sourcePortId: 'value', targetNodeId: 'b', targetPortId: 'value' }],
          groups: [{ id: 'group:inner', parentId: null, name: 'Inner', nodeIds: ['a', 'b'], disabled: false, minimized: false }],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const ok = removeCustomNodeProjectionNode({
    projectionNodeId: 'view:custom:custom-1:a',
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.equal(ok, true);
  const internal = updates[0]?.config.customNode?.internal;
  assert.deepEqual((internal?.nodes as NodeInstance[]).map((node) => node.id), ['b']);
  assert.deepEqual(internal?.connections, []);
  assert.deepEqual(internal?.groups, [
    { id: 'group:inner', parentId: null, name: 'Inner', nodeIds: ['b'], disabled: false, minimized: false },
  ]);
});

test('translateCustomNodeProjectionNodePosition writes projected node movement back to internal relative position', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'inner',
              type: 'float',
              position: { x: 10, y: 20 },
              config: {},
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
              nodeIds: ['inner'],
              disabled: false,
              minimized: false,
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const ok = translateCustomNodeProjectionNodePosition({
    projectionNodeId: 'view:custom:custom-1:inner',
    position: { x: 145, y: 250 },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.equal(ok, true);
  const nodes = updates[0]?.config.customNode?.internal?.nodes as NodeInstance[] | undefined;
  assert.deepEqual(nodes?.[0]?.position, { x: 45, y: 50 });
  assert.deepEqual(updates[0]?.config.customNode?.internal?.groups, [
    {
      id: 'group:inner',
      parentId: null,
      name: 'Inner',
      nodeIds: ['inner'],
      disabled: false,
      minimized: false,
    },
  ]);
});

test('translateCustomNodeProjectionNodePosition can use the current owner view position as relative origin', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'inner',
              type: 'float',
              position: { x: 10, y: 20 },
              config: {},
              inputValues: {},
              outputValues: {},
            },
          ],
          connections: [],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const ok = translateCustomNodeProjectionNodePosition({
    projectionNodeId: 'view:custom:custom-1:inner',
    position: { x: 545, y: 750 },
    ownerViewPosition: { x: 500, y: 700 },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
  });

  assert.equal(ok, true);
  const nodes = updates[0]?.config.customNode?.internal?.nodes as NodeInstance[] | undefined;
  assert.deepEqual(nodes?.[0]?.position, { x: 45, y: 50 });
});

test('appendCustomNodeProjectionConnection writes same-owner projection connections into internal graph', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group-1',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'a',
              type: 'float',
              position: { x: 0, y: 0 },
              config: {},
              inputValues: {},
              outputValues: {},
            },
            {
              id: 'b',
              type: 'float',
              position: { x: 120, y: 0 },
              config: {},
              inputValues: {},
              outputValues: {},
            },
          ],
          connections: [],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];

  const ok = appendCustomNodeProjectionConnection({
    connection: {
      id: 'view-c',
      sourceNodeId: 'view:custom:custom-1:a',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:b',
      targetPortId: 'value',
    },
    getOwnerNode: (nodeId) => (nodeId === 'custom-1' ? owner : null),
    updateOwnerConfig: (nodeId, config) => updates.push({ nodeId, config }),
    createConnectionId: () => 'internal-c',
  });

  assert.equal(ok, true);
  const connections = updates[0]?.config.customNode?.internal?.connections;
  assert.deepEqual(connections, [
    {
      id: 'internal-c',
      sourceNodeId: 'a',
      sourcePortId: 'value',
      targetNodeId: 'b',
      targetPortId: 'value',
    },
  ]);
});

test('refreshCustomNodeProjectionPorts derives labels and types from current internal root proxies', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 100 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group:owner',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'proxy-in',
              type: 'group-proxy',
              position: { x: -40, y: 180 },
              config: { groupId: 'group:owner', direction: 'input', portType: 'boolean', pinned: true },
              inputValues: {},
              outputValues: {},
            },
            {
              id: 'loader',
              type: 'client-loader',
              position: { x: 80, y: 180 },
              config: {},
              inputValues: {},
              outputValues: {},
            },
            {
              id: 'nested-proxy',
              type: 'group-proxy',
              position: { x: -20, y: 280 },
              config: { groupId: 'view:custom:custom-1:group:group:inner', direction: 'input', portType: 'number' },
              inputValues: {},
              outputValues: {},
            },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'proxy-in',
              sourcePortId: 'out',
              targetNodeId: 'loader',
              targetPortId: 'loadAll',
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const next = refreshCustomNodeProjectionPorts({
    definition: { definitionId: 'def-1', name: 'Custom', template: { nodes: [], connections: [] }, ports: [] },
    ownerNode: owner,
    nodeRegistry: {
      get: (type) =>
        type === 'client-loader'
          ? { inputs: [{ id: 'loadAll', label: 'Load All', type: 'boolean' }], outputs: [] }
          : { inputs: [], outputs: [] },
    },
  });

  assert.deepEqual(next?.ports, [
    {
      portKey: 'p:proxy-in',
      side: 'input',
      label: 'Load All',
      type: 'boolean',
      pinned: true,
      y: 80,
      binding: { nodeId: 'proxy-in', portId: 'in' },
    },
  ]);
});

test('refreshCustomNodeProjectionPorts follows nested group proxy chains to the real inner port', () => {
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'def-1',
        groupId: 'group:owner',
        role: 'mother',
        manualGate: true,
        internal: {
          nodes: [
            {
              id: 'root-proxy',
              type: 'group-proxy',
              position: { x: -40, y: 100 },
              config: { groupId: 'group:owner', direction: 'input', portType: 'any', pinned: true },
              inputValues: {},
              outputValues: {},
            },
            {
              id: 'inner-proxy',
              type: 'group-proxy',
              position: { x: 20, y: 100 },
              config: { groupId: 'group:inner', direction: 'input', portType: 'any', pinned: true },
              inputValues: {},
              outputValues: {},
            },
            {
              id: 'loader',
              type: 'client-loader',
              position: { x: 100, y: 100 },
              config: {},
              inputValues: {},
              outputValues: {},
            },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'root-proxy',
              sourcePortId: 'out',
              targetNodeId: 'inner-proxy',
              targetPortId: 'in',
            },
            {
              id: 'c2',
              sourceNodeId: 'inner-proxy',
              sourcePortId: 'out',
              targetNodeId: 'loader',
              targetPortId: 'loadAll',
            },
          ],
        },
      },
    },
    inputValues: {},
    outputValues: {},
  };

  const next = refreshCustomNodeProjectionPorts({
    definition: { definitionId: 'def-1', name: 'Custom', template: { nodes: [], connections: [] }, ports: [] },
    ownerNode: owner,
    nodeRegistry: {
      get: (type) =>
        type === 'client-loader'
          ? { inputs: [{ id: 'loadAll', label: 'Load All', type: 'boolean' }], outputs: [] }
          : { inputs: [], outputs: [] },
    },
  });

  assert.deepEqual(next?.ports, [
    {
      portKey: 'p:root-proxy',
      side: 'input',
      label: 'Load All',
      type: 'boolean',
      pinned: true,
      y: 100,
      binding: { nodeId: 'root-proxy', portId: 'in' },
    },
  ]);
});

test('upsertCustomNodeProjectionPort adds public port metadata for an internal group proxy', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Projected',
    template: { nodes: [], connections: [] },
    ports: [],
  };
  const owner: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 100, y: 200 },
    config: {},
    inputValues: {},
    outputValues: {},
  };

  const next = upsertCustomNodeProjectionPort({
    definition,
    ownerNode: owner,
    node: {
      id: 'proxy-in',
      type: 'group-proxy',
      position: { x: 70, y: 260 },
      config: { direction: 'input', portType: 'number', pinned: true },
      inputValues: {},
      outputValues: {},
    },
  });

  assert.deepEqual(next?.ports, [
    {
      portKey: 'p:proxy-in',
      side: 'input',
      label: 'In',
      type: 'number',
      pinned: true,
      y: 60,
      binding: { nodeId: 'proxy-in', portId: 'in' },
    },
  ]);
});
