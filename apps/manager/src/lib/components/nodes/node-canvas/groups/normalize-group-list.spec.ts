/**
 * Purpose: Regression tests for group list normalization behavior.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeGroup } from '../controllers/group-controller';
import { normalizeGroupList } from './normalize-group-list';

test('normalizeGroupList preserves first-seen order and dedupes nodeIds', () => {
  const input: NodeGroup[] = [
    {
      id: 'g1',
      parentId: null,
      name: 'Group 1',
      nodeIds: ['n1', 'n2', 'n2'],
      disabled: false,
      minimized: false,
      runtimeActive: true,
    },
    {
      id: 'g2',
      parentId: 'g1',
      name: 'Group 2',
      nodeIds: ['n3', 'n4'],
      disabled: true,
      minimized: true,
      runtimeActive: false,
    },
    {
      id: 'g1',
      parentId: null,
      name: 'Group 1 (dup)',
      nodeIds: ['n2', 'n5'],
      disabled: false,
      minimized: false,
    },
  ];

  const result = normalizeGroupList(input);

  assert.deepEqual(
    result.map((group) => group.id),
    ['g1', 'g2']
  );

  const group1 = result[0];
  assert.deepEqual(group1.nodeIds, ['n1', 'n2', 'n5']);
  assert.equal(group1.runtimeActive, true);
});

test('normalizeGroupList coerces ids to strings and ignores empty ids', () => {
  const input = [
    {
      id: 123 as unknown as string,
      parentId: 0 as unknown as string,
      name: 'Group 123',
      nodeIds: ['a', 0 as unknown as string, '', 'b'],
      disabled: false,
      minimized: false,
    },
    {
      id: '',
      parentId: null,
      name: 'Invalid',
      nodeIds: ['c'],
      disabled: false,
      minimized: false,
    },
  ] as NodeGroup[];

  const result = normalizeGroupList(input);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, '123');
  assert.equal(result[0].parentId, null);
  assert.deepEqual(result[0].nodeIds, ['a', '0', 'b']);
});
