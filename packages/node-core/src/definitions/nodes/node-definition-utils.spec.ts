/**
 * Purpose: Regression tests for node definition parsing helpers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  asRecord,
  getArrayValue,
  getBooleanValue,
  getNumberValue,
  getRecordString,
  getStringValue,
} from './node-definition-utils.js';

test('asRecord returns record for objects', () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.equal(asRecord(null), null);
});

test('getStringValue trims strings and handles arrays', () => {
  assert.equal(getStringValue(' test '), 'test');
  assert.equal(getStringValue(['foo']), 'foo');
  assert.equal(getStringValue(123), null);
});

test('getNumberValue returns finite numbers', () => {
  assert.equal(getNumberValue(10), 10);
  assert.equal(getNumberValue(NaN), null);
});

test('getBooleanValue returns booleans', () => {
  assert.equal(getBooleanValue(true), true);
  assert.equal(getBooleanValue('no'), null);
});

test('getArrayValue returns arrays', () => {
  assert.deepEqual(getArrayValue([1, 2]), [1, 2]);
  assert.equal(getArrayValue('nope'), null);
});

test('getRecordString reads string props', () => {
  assert.equal(getRecordString({ url: ' http://x ' }, 'url'), 'http://x');
  assert.equal(getRecordString({ url: 123 }, 'url'), null);
});
