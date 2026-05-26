// Purpose: Regression tests for Custom Node port type normalization.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeCustomNodePortType } from './custom-node-port-types';

test('Custom Node port type normalization preserves pulse ports', () => {
  assert.equal(normalizeCustomNodePortType('pulse'), 'pulse');
});

test('Custom Node port type normalization falls back unknown values to any', () => {
  assert.equal(normalizeCustomNodePortType('missing'), 'any');
});
