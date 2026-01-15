// Purpose: Tests for generic value guard helpers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asRecord, getBoolean, getNumber, getString } from './value-guards';

describe('value-guards', () => {
  it('asRecord returns empty record for invalid values', () => {
    assert.deepEqual(asRecord(null), {});
    assert.deepEqual(asRecord('x'), {});
  });

  it('getString returns default for invalid values', () => {
    assert.equal(getString(null, 'fallback'), 'fallback');
    assert.equal(getString('', 'fallback'), 'fallback');
  });

  it('getNumber returns default for invalid values', () => {
    assert.equal(getNumber(null, 2), 2);
    assert.equal(getNumber('nope', 3), 3);
  });

  it('getBoolean returns default for invalid values', () => {
    assert.equal(getBoolean(null, true), true);
    assert.equal(getBoolean('nope', false), false);
  });
});
