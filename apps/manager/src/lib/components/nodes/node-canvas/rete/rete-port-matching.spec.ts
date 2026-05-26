// Purpose: Verify Manager Rete port compatibility rules for node graph gestures.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCompatiblePortType } from './rete-port-matching';

test('Rete port matching keeps pulse events separate from boolean state', () => {
  assert.equal(isCompatiblePortType('pulse', 'pulse'), true);
  assert.equal(isCompatiblePortType('pulse', 'boolean'), false);
  assert.equal(isCompatiblePortType('boolean', 'pulse'), false);
  assert.equal(isCompatiblePortType('pulse', 'any'), true);
  assert.equal(isCompatiblePortType('any', 'pulse'), true);
});
