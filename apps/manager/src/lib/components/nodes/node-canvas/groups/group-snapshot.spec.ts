import test from 'node:test';
import assert from 'node:assert/strict';

import { groupSnapshotKey, normalizeGroupsForSnapshot } from './group-snapshot';

test('groupSnapshotKey is stable across group and node id ordering', () => {
  const first = groupSnapshotKey([
    {
      id: 'b',
      parentId: null,
      name: 'Beta',
      nodeIds: ['n2', 'n1', 'n1'],
      disabled: false,
      minimized: true,
      runtimeActive: true,
    },
    {
      id: 'a',
      parentId: 'root',
      name: 'Alpha',
      nodeIds: ['n4', 'n3'],
      disabled: true,
      minimized: false,
    },
  ]);

  const second = groupSnapshotKey([
    {
      id: 'a',
      parentId: 'root',
      name: 'Alpha',
      nodeIds: ['n3', 'n4'],
      disabled: true,
      minimized: false,
    },
    {
      id: 'b',
      parentId: null,
      name: 'Beta',
      nodeIds: ['n1', 'n2'],
      disabled: false,
      minimized: true,
      runtimeActive: true,
    },
  ]);

  assert.equal(first, second);
  assert.equal(first, 'a:root:Alpha:1:0::n3,n4|b::Beta:0:1:1:n1,n2');
});

test('normalizeGroupsForSnapshot sanitizes loose persisted records', () => {
  const normalized = normalizeGroupsForSnapshot([
    {
      id: '7',
      parentId: '',
      name: 'Loose',
      nodeIds: ['n1', 2, '', 'n1'],
      disabled: true,
      minimized: true,
      runtimeActive: false,
    },
  ]);

  assert.deepEqual(normalized, [
    {
      id: '7',
      parentId: null,
      name: 'Loose',
      nodeIds: ['n1', '2'],
      disabled: true,
      minimized: true,
      runtimeActive: false,
    },
  ]);
});
