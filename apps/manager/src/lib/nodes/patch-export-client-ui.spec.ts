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

test('exportGraphForPatch includes ClientUI chain nodes when they feed ui-out patch root', () => {
  const graph: GraphState = {
    nodes: [
      node('button', 'client-button', { display: true }),
      node('input', 'client-input-box', { display: true }),
      node('out', 'ui-out'),
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'button', sourcePortId: 'out', targetNodeId: 'input', targetPortId: 'in' },
      { id: 'c2', sourceNodeId: 'input', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(
    result.graph.nodes.map((item) => item.type).sort(),
    ['client-button', 'client-input-box', 'ui-out'].sort()
  );
});
