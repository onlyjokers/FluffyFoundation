// Purpose: Tests for Tone adapter guard helpers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asRecord, getToneRawContext, unwrapDefaultExport } from './tone-guards';

describe('tone-guards', () => {
  it('asRecord returns empty record for invalid values', () => {
    assert.deepEqual(asRecord(null), {});
    assert.deepEqual(asRecord('x'), {});
  });

  it('unwrapDefaultExport returns default when present', () => {
    const value = { default: { foo: 'bar' } };
    assert.deepEqual(unwrapDefaultExport(value), { foo: 'bar' });
  });

  it('getToneRawContext returns rawContext when present', () => {
    const ctx = {} as AudioContext;
    const tone = {
      getContext: () => ({ rawContext: ctx }),
    };
    assert.equal(getToneRawContext(tone), ctx);
  });

  it('getToneRawContext returns null for invalid module', () => {
    assert.equal(getToneRawContext(null), null);
    assert.equal(getToneRawContext({}), null);
  });
});
