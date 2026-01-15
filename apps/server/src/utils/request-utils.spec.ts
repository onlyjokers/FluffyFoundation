/**
 * Purpose: Regression tests for request parsing helpers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getBodyString, getQueryString } from './request-utils.js';

test('getQueryString returns string values', () => {
  assert.equal(getQueryString({ token: 'abc' }, 'token'), 'abc');
  assert.equal(getQueryString({ token: ['def'] }, 'token'), 'def');
  assert.equal(getQueryString({ token: 123 }, 'token'), null);
});

test('getBodyString trims and normalizes values', () => {
  assert.equal(getBodyString({ kind: ' audio ' }, 'kind'), 'audio');
  assert.equal(getBodyString({ kind: ['video'] }, 'kind'), 'video');
  assert.equal(getBodyString({ kind: '' }, 'kind'), null);
});
