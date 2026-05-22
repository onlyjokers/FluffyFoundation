// Purpose: Verify editor-only Custom Node projection graphs stay distinct from canonical graph ids.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import {
  buildCustomNodeProjectionGraph,
  isCustomNodeProjectionId,
  parseCustomNodeProjectionNodeId,
  resolveCustomNodeProjectionPublicConnection,
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
