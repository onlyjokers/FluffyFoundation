/**
 * Purpose: FF-13 SDK-client tests for scoped client controller command envelopes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClientControllerEnvelope } from './client-control-transfer.js';

test('client controller envelope carries client actor role and accepted transfer capability scope', () => {
  const envelope = createClientControllerEnvelope({
    clientId: 'client-1',
    capability: {
      transferId: 'transfer-1',
      scopeGroupId: 'stage-left',
      targetClientId: 'client-1',
      capabilities: ['group.view', 'group.mutate', 'group.release'],
      acceptedAt: 1_000,
      expiresAt: 31_000,
    },
  });

  assert.equal(envelope.actor, 'client-1');
  assert.equal(envelope.role, 'client');
  assert.equal(envelope.scopeGroupId, 'stage-left');
  assert.equal(envelope.transferId, 'transfer-1');
  assert.notEqual(envelope.correlationId, '');
  assert.notEqual(envelope.idempotencyKey, '');
});
