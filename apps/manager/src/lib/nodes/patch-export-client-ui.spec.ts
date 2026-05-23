// Purpose: Regression coverage for exporting ClientUI nodes into deployed Client patches.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeRegistry, registerDefaultNodeDefinitions } from '@shugu/node-core';
import { exportGraphForPatch } from './patch-export';
import type { GraphState, NodeInstance } from './types';

const node = (id: string, type: string, inputValues: Record<string, unknown> = {}): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues,
  outputValues: {},
});

const registry = new NodeRegistry();
registerDefaultNodeDefinitions(registry, {
  getClientId: () => null,
  getAllClientIds: () => [],
  getSelectedClientIds: () => [],
  executeCommand: () => {},
});

test('exportGraphForPatch includes ClientUI nodes when they feed a patch root', () => {
  const graph: GraphState = {
    nodes: [
      node('button', 'client-button', { display: true }),
      node('gate', 'logic-if'),
      node('value-a', 'number', { value: 1 }),
      node('value-b', 'number', { value: 0 }),
      node('scale', 'img-scale'),
      node('out', 'image-out'),
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'button', sourcePortId: 'pressed', targetNodeId: 'gate', targetPortId: 'condition' },
      { id: 'c2', sourceNodeId: 'value-a', sourcePortId: 'value', targetNodeId: 'gate', targetPortId: 'whenTrue' },
      { id: 'c3', sourceNodeId: 'value-b', sourcePortId: 'value', targetNodeId: 'gate', targetPortId: 'whenFalse' },
      { id: 'c4', sourceNodeId: 'gate', sourcePortId: 'out', targetNodeId: 'scale', targetPortId: 'scale' },
      { id: 'c5', sourceNodeId: 'scale', sourcePortId: 'image', targetNodeId: 'out', targetPortId: 'image' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.type).sort(),
    ['client-button', 'image-out', 'img-scale', 'logic-if', 'number', 'number'].sort()
  );
});
