// Purpose: tests for pure group frame computation.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import type { NodeGroup } from './group-types';
import { computeGroupFramesFromState } from './group-frame-computation';

const group = (patch: Partial<NodeGroup> & { id: string; nodeIds?: string[] }): NodeGroup => ({
  id: patch.id,
  parentId: patch.parentId ?? null,
  name: patch.name ?? patch.id,
  nodeIds: patch.nodeIds ?? [],
  disabled: patch.disabled ?? false,
  minimized: patch.minimized ?? false,
  runtimeActive: patch.runtimeActive,
});

const graph: GraphState = {
  nodes: [
    { id: 'a', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'b', type: 'number', position: { x: 100, y: 100 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [],
};

const boundsByNodeId = new Map<string, NodeBounds>([
  ['a', { left: 0, top: 0, right: 50, bottom: 50 }],
  ['b', { left: 100, top: 100, right: 150, bottom: 150 }],
]);

test('computeGroupFramesFromState hides descendant frames when parent is minimized', () => {
  const parent = group({ id: 'parent', nodeIds: ['a'], minimized: true });
  const child = group({ id: 'child', parentId: 'parent', nodeIds: ['b'] });

  const frames = computeGroupFramesFromState({
    groups: [parent, child],
    editModeGroupId: null,
    editModeGroupBounds: null,
    forcedHiddenNodeIds: new Set(),
    graph,
    localLoops: [],
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(frames.map((frame) => frame.group.id), ['parent']);
});

test('computeGroupFramesFromState uses edit-mode bounds without recomputing group bounds', () => {
  const frame = computeGroupFramesFromState({
    groups: [group({ id: 'editing', nodeIds: ['missing'] })],
    editModeGroupId: 'editing',
    editModeGroupBounds: { left: 10, top: 20, right: 90, bottom: 140 },
    forcedHiddenNodeIds: new Set(),
    graph,
    localLoops: [],
    getNodeBounds: () => {
      throw new Error('edit-mode frame should not ask adapter for node bounds');
    },
  })[0];

  assert.deepEqual(
    { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    { left: 10, top: 20, width: 80, height: 120 }
  );
});

test('computeGroupFramesFromState inherits effective disabled state from inactive parent', () => {
  const frames = computeGroupFramesFromState({
    groups: [
      group({ id: 'parent', nodeIds: ['a'], runtimeActive: false }),
      group({ id: 'child', parentId: 'parent', nodeIds: ['b'] }),
    ],
    editModeGroupId: null,
    editModeGroupBounds: null,
    forcedHiddenNodeIds: new Set(),
    graph,
    localLoops: [],
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  const childFrame = frames.find((frame) => frame.group.id === 'child');
  assert.equal(childFrame?.effectiveDisabled, true);
  assert.equal(childFrame?.depth, 1);
});
