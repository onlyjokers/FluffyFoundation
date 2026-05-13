// Purpose: tests for group frame bounds helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import type { NodeGroup } from './group-types';
import { buildGroupIndex, computeGroupFrameBoundsWithChildren, computeSingleGroupFrameBounds, mergeBounds } from './group-bounds';

const group = (id: string, nodeIds: string[], parentId: string | null = null, minimized = false): NodeGroup => ({
  id,
  parentId,
  name: id,
  nodeIds,
  disabled: false,
  minimized,
});

const graph: GraphState = {
  nodes: [
    { id: 'a', type: 'number', position: { x: 10, y: 20 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'b', type: 'number', position: { x: 100, y: 120 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [],
};

const boundsByNodeId = new Map<string, NodeBounds>([
  ['a', { left: 10, top: 20, right: 60, bottom: 80 }],
  ['b', { left: 100, top: 120, right: 160, bottom: 190 }],
]);

test('mergeBounds expands to include both bounds', () => {
  assert.deepEqual(
    mergeBounds({ left: 10, top: 20, right: 30, bottom: 40 }, { left: 5, top: 25, right: 50, bottom: 35 }),
    { left: 5, top: 20, right: 50, bottom: 40 }
  );
});

test('buildGroupIndex normalizes ids, parent ids, node ids, and minimized flag', () => {
  const { byId, childrenByParentId } = buildGroupIndex([{ ...group('child', [1 as unknown as string], 'parent'), minimized: true }]);

  assert.deepEqual(byId.get('child')?.nodeIds, ['1']);
  assert.equal(byId.get('child')?.minimized, true);
  assert.deepEqual(childrenByParentId.get('parent'), ['child']);
});

test('computeGroupFrameBoundsWithChildren includes child group bounds and padding', () => {
  const groups = [group('parent', ['a']), group('child', ['b'], 'parent')];
  const { byId, childrenByParentId } = buildGroupIndex(groups);

  const bounds = computeGroupFrameBoundsWithChildren({
    groupId: 'parent',
    byId,
    childrenByParentId,
    cache: new Map(),
    visiting: new Set(),
    hiddenNodeIds: new Set(),
    graph,
    localLoops: [],
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(bounds, { left: -42, top: -44, right: 248, bottom: 282 });
});

test('computeSingleGroupFrameBounds prepares indexes and hidden minimized node ids', () => {
  const bounds = computeSingleGroupFrameBounds({
    groupId: 'parent',
    groups: [group('parent', ['a']), group('hidden', ['b'], null, true)],
    graph,
    localLoops: [],
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(bounds, { left: -42, top: -44, right: 112, bottom: 132 });
});
