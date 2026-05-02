/**
 * Purpose: Regression tests for control-batch payload merging.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeControlPayload } from './payload-merge.js';

test('mergeControlPayload shallow merges plain objects', () => {
  const prev = { a: 1, b: 2 };
  const next = { b: 3, c: 4 };
  assert.deepEqual(mergeControlPayload(prev, next), { a: 1, b: 3, c: 4 });
});

test('mergeControlPayload returns next when not plain objects', () => {
  assert.deepEqual(mergeControlPayload({ mode: 'on' }, { a: 1 }), { mode: 'on', a: 1 });
  assert.deepEqual(mergeControlPayload({ a: 1 }, { pattern: [100] }), { a: 1, pattern: [100] });
});
