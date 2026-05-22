// Purpose: Regression tests for compiling Custom Nodes into deployable patch graphs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { writeCustomNodeState } from './instance';
import { compileGraphForPatch } from './flatten';
import type { CustomNodeDefinition } from './types';

const numberNode = (id: string): NodeInstance => ({
  id,
  type: 'number',
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('compileGraphForPatch removes a gated-off custom node subgraph from deploy output', () => {
  const definition: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Gated Custom',
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
        binding: { nodeId: 'inner', portId: 'value' },
      },
    ],
  };

  const customNode: NodeInstance = {
    id: 'custom-1',
    type: 'custom:def-1',
    position: { x: 0, y: 0 },
    config: writeCustomNodeState({}, {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: false,
      internal: definition.template,
    }),
    inputValues: { gate: false },
    outputValues: {},
  };

  const graph: GraphState = {
    nodes: [customNode],
    connections: [],
  };

  const compiled = compileGraphForPatch(graph, [definition]);

  assert.deepEqual(compiled.nodes, []);
  assert.deepEqual(compiled.connections, []);
});
