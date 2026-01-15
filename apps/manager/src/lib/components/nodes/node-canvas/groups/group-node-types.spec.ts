/**
 * Purpose: Regression tests for group node type classification.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GROUP_FRAME_NODE_TYPE,
  isGroupDecorationNodeType,
} from './group-node-types';

test('isGroupDecorationNodeType returns true for group frame and group port node types', () => {
  assert.equal(isGroupDecorationNodeType(GROUP_FRAME_NODE_TYPE), true);
  assert.equal(isGroupDecorationNodeType('group-gate'), true);
  assert.equal(isGroupDecorationNodeType('group-proxy'), true);
  assert.equal(isGroupDecorationNodeType('group-activate'), true);
});

test('isGroupDecorationNodeType returns false for non-group node types', () => {
  assert.equal(isGroupDecorationNodeType('number'), false);
  assert.equal(isGroupDecorationNodeType('custom-node'), false);
  assert.equal(isGroupDecorationNodeType(''), false);
});
