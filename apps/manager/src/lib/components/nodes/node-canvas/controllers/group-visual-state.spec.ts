/**
 * Purpose: Regression coverage for group visual state planning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGroupVisualStatePlan } from './group-visual-state';
import type { NodeGroup } from './group-types';

test('minimized parent group hides child group decoration nodes and attached connections', () => {
  const groups: NodeGroup[] = [
    {
      id: 'parent',
      parentId: null,
      name: 'Parent',
      nodeIds: ['worker'],
      disabled: false,
      minimized: true,
    },
    {
      id: 'child',
      parentId: 'parent',
      name: 'Child',
      nodeIds: ['child-worker'],
      disabled: false,
      minimized: false,
    },
  ];

  const plan = computeGroupVisualStatePlan({
    groups,
    disabledNodeIds: new Set(),
    selectedNodeIds: new Set(['worker']),
    forcedHiddenNodeIds: new Set(),
    graph: {
      nodes: [
        { id: 'worker', type: 'number', position: { x: 0, y: 0 }, config: {} },
        { id: 'child-gate', type: 'group-gate', position: { x: 0, y: 0 }, config: { groupId: 'child' } },
      ],
      connections: [
        {
          id: 'conn',
          sourceNodeId: 'worker',
          sourcePortId: 'out',
          targetNodeId: 'child-gate',
          targetPortId: 'in',
        },
      ],
    },
    getNodeVisualState: () => null,
    getConnectionVisualState: () => null,
  });

  assert.deepEqual(plan.nodePatches, [
    { nodeId: 'worker', hidden: true, groupSelected: true },
    { nodeId: 'child-gate', hidden: true },
  ]);
  assert.deepEqual(plan.connectionPatches, [{ connectionId: 'conn', hidden: true }]);
});
