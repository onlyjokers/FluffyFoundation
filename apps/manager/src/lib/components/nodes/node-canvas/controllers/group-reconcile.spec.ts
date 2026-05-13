// Purpose: tests for pure group graph reconciliation.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeGroup } from './group-types';
import { reconcileGroupsWithGraphNodes } from './group-reconcile';

const group = (id: string, nodeIds: string[], parentId: string | null = null): NodeGroup => ({
  id,
  parentId,
  name: id,
  nodeIds,
  disabled: false,
  minimized: false,
});

const graph = (ids: string[]): GraphState => ({
  nodes: ids.map((id) => ({
    id,
    type: 'number',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  })),
  connections: [],
});

test('reconcileGroupsWithGraphNodes removes missing nodes while preserving group order', () => {
  const result = reconcileGroupsWithGraphNodes([group('g1', ['b', 'a', 'missing'])], graph(['a', 'b']));

  assert.equal(result.changed, true);
  assert.deepEqual(result.removedGroupIds, []);
  assert.deepEqual(result.nextGroups.map((g) => g.nodeIds), [['b', 'a']]);
});

test('reconcileGroupsWithGraphNodes removes groups whose subtree has no remaining graph nodes', () => {
  const result = reconcileGroupsWithGraphNodes([group('parent', ['missing']), group('child', ['gone'], 'parent')], graph([]));

  assert.equal(result.changed, true);
  assert.deepEqual(new Set(result.removedGroupIds), new Set(['parent', 'child']));
  assert.deepEqual(result.nextGroups, []);
});

test('reconcileGroupsWithGraphNodes keeps parent membership as child subtree union', () => {
  const result = reconcileGroupsWithGraphNodes([group('parent', ['a']), group('child', ['b'], 'parent')], graph(['a', 'b']));

  assert.equal(result.changed, true);
  assert.deepEqual(result.nextGroups.find((g) => g.id === 'parent')?.nodeIds, ['a', 'b']);
  assert.deepEqual(result.nextGroups.find((g) => g.id === 'child')?.nodeIds, ['b']);
});
