// Purpose: Verify Node Graph deletion keeps server semantic graph in sync.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDeleteNodeWithRules } from './custom-node-delete';
import type { NodeInstance } from '$lib/nodes/types';

test('deleteNodeWithRules delegates local removal to a successful semantic remove command', () => {
  const node: NodeInstance = {
    id: 'n1',
    type: 'number',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const nodes = new Map([[node.id, node]]);
  const semanticRemovals: string[] = [];
  const localRemovals: string[] = [];

  const deleteNode = createDeleteNodeWithRules({
    nodeEngine: {
      getNode: (id) => nodes.get(id),
      removeNode: (id) => {
        localRemovals.push(id);
        nodes.delete(id);
      },
      exportGraph: () => ({ nodes: Array.from(nodes.values()) }),
    },
    readCustomNodeState: () => null,
    getCustomNodeDefinition: () => undefined,
    removeCustomNodeDefinition: () => undefined,
    getSelectedNodeId: () => '',
    setSelectedNode: () => undefined,
    confirm: () => true,
    removeNodeCommand: (id) => {
      semanticRemovals.push(id);
      return true;
    },
  });

  deleteNode('n1');

  assert.deepEqual(semanticRemovals, ['n1']);
  assert.deepEqual(localRemovals, []);
});
