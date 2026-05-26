// Purpose: Regression coverage for group edge target detection used by connection drops.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGroupEdgeFinder } from './group-edge-finder';

test('findGroupFrameForNodeAt returns an output edge target when a member node is dragged outside', () => {
  const finder = createGroupEdgeFinder({
    getFrames: () => [
      {
        group: {
          id: 'group-1',
          parentId: null,
          name: 'Group',
          nodeIds: ['inside'],
          disabled: false,
          minimized: false,
        },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        effectiveDisabled: false,
        depth: 0,
      },
    ],
    clientToGraph: (x, y) => ({ x, y }),
    getScale: () => 1,
  });

  const target = finder.findGroupFrameForNodeAt('inside', 540, 180);

  assert.equal(target?.groupId, 'group-1');
  assert.equal(target?.side, 'output');
});

test('findGroupFrameForNodeAt ignores drops that are still inside the group', () => {
  const finder = createGroupEdgeFinder({
    getFrames: () => [
      {
        group: {
          id: 'group-1',
          parentId: null,
          name: 'Group',
          nodeIds: ['inside'],
          disabled: false,
          minimized: false,
        },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        effectiveDisabled: false,
        depth: 0,
      },
    ],
    clientToGraph: (x, y) => ({ x, y }),
    getScale: () => 1,
  });

  assert.equal(finder.findGroupFrameForNodeAt('inside', 300, 180), null);
});

test('findGroupFrameForNode returns an input edge target for a member node', () => {
  const finder = createGroupEdgeFinder({
    getFrames: () => [
      {
        group: {
          id: 'group-1',
          parentId: null,
          name: 'Group',
          nodeIds: ['inside'],
          disabled: false,
          minimized: false,
        },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        effectiveDisabled: false,
        depth: 0,
      },
    ],
    clientToGraph: (x, y) => ({ x, y }),
    getScale: () => 1,
  });

  const target = finder.findGroupFrameForNode('inside', 'input');

  assert.equal(target?.groupId, 'group-1');
  assert.equal(target?.side, 'input');
});

test('findGroupFrameAt returns an input edge target when dropped inside a group', () => {
  const finder = createGroupEdgeFinder({
    getFrames: () => [
      {
        group: {
          id: 'group-1',
          parentId: null,
          name: 'Group',
          nodeIds: ['inside'],
          disabled: false,
          minimized: false,
        },
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        effectiveDisabled: false,
        depth: 0,
      },
    ],
    clientToGraph: (x, y) => ({ x, y }),
    getScale: () => 1,
  });

  const target = finder.findGroupFrameAt(160, 140, 'input');

  assert.equal(target?.groupId, 'group-1');
  assert.equal(target?.side, 'input');
});
