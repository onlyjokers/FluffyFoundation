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
        config: writeCustomNodeState({}, {
          definitionId: 'def-1',
          groupId: 'group-1',
          role: 'mother',
          manualGate: true,
          internal: definition.template,
        }),
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
