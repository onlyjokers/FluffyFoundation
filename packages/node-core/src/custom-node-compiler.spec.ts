// Purpose: Verify shared Custom Node compilation for server and manager runtime deploy paths.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compileGraphForPatch } from './custom-node-compiler.js';
import type { CustomNodeDefinition } from './semantic-graph-types.js';
import type { GraphState, NodeInstance } from './types.js';

const writeCustomNodeState = (
  config: Record<string, unknown>,
  state: {
    definitionId: string;
    groupId: string;
    role: 'mother' | 'child';
    manualGate: boolean;
    internal: GraphState;
  }
): Record<string, unknown> => ({
  ...config,
  customNode: {
    definitionId: state.definitionId,
    groupId: state.groupId,
    role: state.role,
    manualGate: state.manualGate,
    internal: state.internal,
  },
});

const numberNode = (id: string): NodeInstance => ({
  id,
  type: 'number',
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('compileGraphForPatch expands a collapsed Custom Node using shared semantic definitions', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Shared Compiler Custom',
    template: {
      nodes: [numberNode('inner')],
      connections: [],
    },
    ports: [
      {
        portKey: 'p:inner',
        label: 'Value',
        side: 'output',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner', portId: 'value' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-1',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-1',
            groupId: 'group-1',
            role: 'mother',
            manualGate: true,
            internal: definition.template,
          }
        ),
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition], {
    createConnectionId: () => 'conn-fixed',
  });

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.type]),
    [['cn:custom-1:inner', 'number']]
  );
  assert.deepEqual(compiled.connections, []);
});

test('compileGraphForPatch rewires external custom inputs through bound group proxies', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-proxy',
    name: 'Proxy Input Custom',
    template: {
      nodes: [
        {
          id: 'input-proxy',
          type: 'group-proxy',
          position: { x: 0, y: 0 },
          config: { direction: 'input', portType: 'number' },
          inputValues: {},
          outputValues: {},
        },
        numberNode('inner'),
      ],
      connections: [
        {
          id: 'proxy-to-inner',
          sourceNodeId: 'input-proxy',
          sourcePortId: 'out',
          targetNodeId: 'inner',
          targetPortId: 'value',
        },
      ],
    },
    ports: [
      {
        portKey: 'amount',
        label: 'Amount',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'input-proxy', portId: 'in' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      { ...numberNode('source'), config: { value: 2.69 } },
      {
        id: 'custom-1',
        type: 'custom:def-proxy',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-proxy',
            groupId: 'group-1',
            role: 'mother',
            manualGate: true,
            internal: definition.template,
          }
        ),
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'external-to-custom',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'amount',
      },
    ],
  };

  let nextConnection = 0;
  const compiled = compileGraphForPatch(graph, [definition], {
    createConnectionId: () => `conn-${(nextConnection += 1)}`,
  });

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.type]),
    [
      ['source', 'number'],
      ['cn:custom-1:inner', 'number'],
    ]
  );
  assert.ok(
    compiled.connections.some(
      (connection) =>
        connection.sourceNodeId === 'source' &&
        connection.sourcePortId === 'value' &&
        connection.targetNodeId === 'cn:custom-1:inner' &&
        connection.targetPortId === 'value'
    )
  );
});

test('compileGraphForPatch applies unconnected public custom inputs to bound internal inputs', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-input-value',
    name: 'Public Input Value Custom',
    template: {
      nodes: [numberNode('inner')],
      connections: [],
    },
    ports: [
      {
        portKey: 'amount',
        label: 'Amount',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner', portId: 'value' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-input-value',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-input-value',
            groupId: 'group-1',
            role: 'mother',
            manualGate: true,
            internal: definition.template,
          }
        ),
        inputValues: { amount: 42 },
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.inputValues]),
    [['cn:custom-1:inner', { value: 42 }]]
  );
  assert.deepEqual(compiled.connections, []);
});

test('compileGraphForPatch applies unconnected public custom inputs through bound group proxies', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-proxy-value',
    name: 'Proxy Public Input Value Custom',
    template: {
      nodes: [
        {
          id: 'input-proxy',
          type: 'group-proxy',
          position: { x: 0, y: 0 },
          config: { direction: 'input', portType: 'number' },
          inputValues: {},
          outputValues: {},
        },
        numberNode('inner'),
      ],
      connections: [
        {
          id: 'proxy-to-inner',
          sourceNodeId: 'input-proxy',
          sourcePortId: 'out',
          targetNodeId: 'inner',
          targetPortId: 'value',
        },
      ],
    },
    ports: [
      {
        portKey: 'amount',
        label: 'Amount',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'input-proxy', portId: 'in' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-proxy-value',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-proxy-value',
            groupId: 'group-1',
            role: 'mother',
            manualGate: true,
            internal: definition.template,
          }
        ),
        inputValues: { amount: 99 },
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.inputValues]),
    [['cn:custom-1:inner', { value: 99 }]]
  );
  assert.deepEqual(compiled.connections, []);
});

test('compileGraphForPatch expands when the runtime gate input is active even if manualGate config is stale', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-stale-gate',
    name: 'Stale Gate Custom',
    template: {
      nodes: [numberNode('inner')],
      connections: [],
    },
    ports: [
      {
        portKey: 'amount',
        label: 'Amount',
        side: 'input',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner', portId: 'value' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-stale-gate',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-stale-gate',
            groupId: 'group-1',
            role: 'mother',
            manualGate: false,
            internal: definition.template,
          }
        ),
        inputValues: { gate: true },
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.type]),
    [['cn:custom-1:inner', 'number']]
  );
});

test('compileGraphForPatch falls back to manualGate when no runtime gate input exists', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-manual-gate',
    name: 'Manual Gate Custom',
    template: {
      nodes: [numberNode('inner')],
      connections: [],
    },
    ports: [],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-manual-gate',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-manual-gate',
            groupId: 'group-1',
            role: 'mother',
            manualGate: false,
            internal: definition.template,
          }
        ),
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(compiled.nodes, []);
  assert.deepEqual(compiled.connections, []);
});

test('compileGraphForPatch materializes internal custom-node groups for runtime group gates', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-nested-group',
    name: 'Nested Group Custom',
    template: {
      nodes: [
        {
          id: 'active-input',
          type: 'group-proxy',
          position: { x: 0, y: 0 },
          config: { direction: 'input', portType: 'boolean' },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inner-gate',
          type: 'group-gate',
          position: { x: 80, y: 0 },
          config: { groupId: 'group:inner' },
          inputValues: {},
          outputValues: {},
        },
        numberNode('inner'),
      ],
      connections: [
        {
          id: 'proxy-to-gate',
          sourceNodeId: 'active-input',
          sourcePortId: 'out',
          targetNodeId: 'inner-gate',
          targetPortId: 'active',
        },
      ],
      groups: [
        {
          id: 'group:inner',
          parentId: null,
          name: 'Inner',
          nodeIds: ['inner'],
          disabled: false,
          minimized: false,
          runtimeActive: false,
        },
      ],
    },
    ports: [
      {
        portKey: 'active',
        label: 'Active',
        side: 'input',
        type: 'boolean',
        pinned: true,
        y: 0,
        binding: { nodeId: 'active-input', portId: 'in' },
      },
    ],
  };

  const graph: GraphState = {
    nodes: [
      {
        id: 'custom-1',
        type: 'custom:def-nested-group',
        position: { x: 0, y: 0 },
        config: writeCustomNodeState(
          {},
          {
            definitionId: 'def-nested-group',
            groupId: 'group:custom',
            role: 'mother',
            manualGate: true,
            internal: definition.template,
          }
        ),
        inputValues: { active: false },
        outputValues: {},
      },
    ],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(
    compiled.nodes.map((node) => [node.id, node.type]),
    [
      ['cn:custom-1:inner-gate', 'group-gate'],
      ['cn:custom-1:inner', 'number'],
    ]
  );
  assert.deepEqual(compiled.groups, [
    {
      id: 'cn:custom-1:group:group:inner',
      parentId: null,
      name: 'Inner',
      nodeIds: ['cn:custom-1:inner'],
      disabled: false,
      minimized: false,
    },
  ]);
});
