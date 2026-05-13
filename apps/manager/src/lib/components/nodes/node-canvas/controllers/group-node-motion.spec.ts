/**
 * Purpose: Regression coverage for group collision motion planning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planNodesOutOfBounds } from './group-node-motion';

const viewport = { k: 1, tx: 0, ty: 0 };

test('planNodesOutOfBounds ignores decoration nodes and moves normal nodes out of a frame', () => {
  const updates = planNodesOutOfBounds({
    bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    excludeNodeIds: new Set(),
    graph: {
      nodes: [
        { id: 'regular', type: 'number', position: { x: 0, y: 0 }, config: {} },
        { id: 'gate', type: 'group-gate', position: { x: 0, y: 0 }, config: { groupId: 'g1' } },
      ],
      connections: [],
    },
    adapter: {
      getViewportTransform: () => viewport,
      getNodePosition: (id) => ({ x: id === 'regular' ? 40 : 10, y: id === 'regular' ? 40 : 10 }),
      getNodeBounds: (id) =>
        id === 'regular'
          ? { left: 40, top: 40, right: 60, bottom: 60 }
          : { left: 10, top: 10, right: 30, bottom: 30 },
    },
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'regular');
  assert.deepEqual(updates[0].from, { x: 40, y: 40 });
  assert.notDeepEqual(updates[0].to, updates[0].from);
});
