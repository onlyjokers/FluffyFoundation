// Purpose: Tests for node executor override parsing helpers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractOverrides } from './node-executor-overrides';

describe('extractOverrides', () => {
  it('returns empty list for invalid payloads', () => {
    assert.deepEqual(extractOverrides(null), []);
    assert.deepEqual(extractOverrides({}), []);
  });

  it('parses overrides with portId and ttlMs', () => {
    const payload = {
      overrides: [
        {
          nodeId: 'n1',
          portId: 'in',
          kind: 'config',
          value: 123,
          ttlMs: 250,
        },
      ],
    };
    assert.deepEqual(extractOverrides(payload), [
      {
        nodeId: 'n1',
        key: 'in',
        kind: 'config',
        value: 123,
        ttlMs: 250,
      },
    ]);
  });

  it('falls back to key when portId missing', () => {
    const payload = {
      overrides: [
        {
          nodeId: 'n2',
          key: 'out',
          value: 'x',
        },
      ],
    };
    assert.deepEqual(extractOverrides(payload), [
      {
        nodeId: 'n2',
        key: 'out',
        kind: 'input',
        value: 'x',
      },
    ]);
  });
});
