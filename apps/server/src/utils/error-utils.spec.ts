/**
 * Purpose: Regression tests for server error code extraction.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getErrorCode } from './error-utils.js';

test('getErrorCode returns string code when present', () => {
  assert.equal(getErrorCode({ code: 'ENOENT' }), 'ENOENT');
});

test('getErrorCode returns null for invalid shapes', () => {
  assert.equal(getErrorCode(null), null);
  assert.equal(getErrorCode({}), null);
  assert.equal(getErrorCode({ code: 123 }), null);
});
