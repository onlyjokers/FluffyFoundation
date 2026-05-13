// Purpose: tests for group drop frame and edit membership helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import type { NodeGroup } from './group-types';
import {
  buildDropFrameContext,
  computeSelectionScreenBounds,
  planDisassembleGroup,
  pickSmallestGroupAtPoint,
  planAddNodeToGroupChain,
  planEditGroupMembershipChange,
  shouldEnforceFrameForMovedNodes,
} from './group-drop-helpers';

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
    { id: 'b', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'port', type: 'group-proxy', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [],
};

test('buildDropFrameContext indexes frame membership by smallest frame area first', () => {
  const context = buildDropFrameContext({
    groups: [group({ id: 'large', nodeIds: ['a'] }), group({ id: 'small', nodeIds: ['a'] })],
    loops: [],
    editModeGroupId: null,
    editModeGroupBounds: null,
    computeGroupBounds: (groupId) =>
      groupId === 'large'
        ? { left: 0, top: 0, right: 100, bottom: 100 }
        : { left: 0, top: 0, right: 20, bottom: 20 },
    computeLoopBounds: () => null,
  });

  assert.deepEqual(context.frameMoves?.nodeToFrameIds.get('a'), ['group:small', 'group:large']);
});

test('shouldEnforceFrameForMovedNodes detects direct membership or dropped center inside frame', () => {
  const bounds: NodeBounds = { left: 0, top: 0, right: 100, bottom: 100 };

  assert.equal(
    shouldEnforceFrameForMovedNodes(['a'], new Set(['a']), bounds, () => null),
    true
  );
  assert.equal(
    shouldEnforceFrameForMovedNodes(['b'], new Set(['a']), bounds, () => ({ cx: 20, cy: 20 })),
    true
  );
  assert.equal(
    shouldEnforceFrameForMovedNodes(['b'], new Set(['a']), bounds, () => ({ cx: 120, cy: 20 })),
    false
  );
});

test('planEditGroupMembershipChange ignores decoration nodes and reports add/remove sets', () => {
  const result = planEditGroupMembershipChange({
    movedNodeIds: ['a', 'b', 'port'],
    group: group({ id: 'editing', nodeIds: ['b', 'port'] }),
    bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    graph,
    getNodeCenter: (nodeId) => {
      if (nodeId === 'a') return { cx: 10, cy: 10 };
      if (nodeId === 'b') return { cx: 140, cy: 10 };
      return { cx: 10, cy: 10 };
    },
  });

  assert.deepEqual(result.added, ['a']);
  assert.deepEqual(result.removed, ['b']);
});

test('pickSmallestGroupAtPoint returns the smallest containing group', () => {
  const small = group({ id: 'small', nodeIds: ['a'] });
  const large = group({ id: 'large', nodeIds: ['b'] });

  const picked = pickSmallestGroupAtPoint([large, small], 10, 10, (id) =>
    id === 'small'
      ? { left: 0, top: 0, right: 20, bottom: 20 }
      : { left: 0, top: 0, right: 100, bottom: 100 }
  );

  assert.equal(picked?.id, 'small');
});

test('planAddNodeToGroupChain adds to target ancestors and reports disabled target chain', () => {
  const result = planAddNodeToGroupChain({
    groups: [
      group({ id: 'parent', nodeIds: ['a'], disabled: true }),
      group({ id: 'child', parentId: 'parent', nodeIds: ['b'] }),
    ],
    groupId: 'child',
    nodeId: 'new',
  });

  assert.equal(result.didAdd, true);
  assert.equal(result.effectiveDisabled, true);
  assert.deepEqual(result.nextGroups.find((item) => item.id === 'parent')?.nodeIds, ['a', 'new']);
  assert.deepEqual(result.nextGroups.find((item) => item.id === 'child')?.nodeIds, ['b', 'new']);
});

test('planDisassembleGroup removes target and descendants', () => {
  const result = planDisassembleGroup({
    groups: [
      group({ id: 'root', nodeIds: ['a'] }),
      group({ id: 'child', parentId: 'root', nodeIds: ['b'] }),
      group({ id: 'sibling', nodeIds: ['c'] }),
    ],
    groupId: 'root',
  });

  assert.deepEqual(Array.from(result.removedGroupIds).sort(), ['child', 'root']);
  assert.deepEqual(result.nextGroups.map((item) => item.id), ['sibling']);
});

test('computeSelectionScreenBounds projects graph bounds into screen bounds with padding', () => {
  const result = computeSelectionScreenBounds({
    nodeIds: ['a', 'b'],
    transform: { k: 2, tx: 5, ty: 10 },
    getNodeBounds: (nodeId) =>
      nodeId === 'a'
        ? { left: 0, top: 0, right: 10, bottom: 10 }
        : { left: 10, top: 20, right: 30, bottom: 40 },
  });

  assert.deepEqual(result, { left: -13, top: -8, width: 96, height: 116 });
});
