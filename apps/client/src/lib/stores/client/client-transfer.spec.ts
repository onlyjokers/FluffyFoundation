/**
 * Purpose: FF-13 client UI-state tests for transfer confirmation and visible lifecycle labels.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';

import {
  clientControlTransfer,
  formatClientControlTransferStatus,
  applyClientControlTransferStatus,
} from './client-transfer.js';

test('client transfer store exposes pending, accepted, revoked, and control-lost labels', () => {
  applyClientControlTransferStatus({
    kind: 'client-control-transfer-status',
    transferId: 'transfer-1',
    groupId: 'stage-left',
    targetClientId: 'client-1',
    status: 'pending',
    offeredBy: { actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
    offeredAt: 1_000,
    expiresAt: 31_000,
    capability: {
      transferId: 'transfer-1',
      scopeGroupId: 'stage-left',
      targetClientId: 'client-1',
      capabilities: ['group.view', 'group.mutate', 'group.release'],
      expiresAt: 31_000,
    },
  });
  assert.equal(formatClientControlTransferStatus(get(clientControlTransfer)), 'Pending control request');

  applyClientControlTransferStatus({ ...get(clientControlTransfer)!, status: 'accepted', acceptedAt: 2_000 });
  assert.equal(formatClientControlTransferStatus(get(clientControlTransfer)), 'Client control active');

  applyClientControlTransferStatus({ ...get(clientControlTransfer)!, status: 'revoked', revokedAt: 3_000 });
  assert.equal(formatClientControlTransferStatus(get(clientControlTransfer)), 'Client control revoked');

  applyClientControlTransferStatus({ ...get(clientControlTransfer)!, status: 'control-lost', revokedAt: 4_000 });
  assert.equal(formatClientControlTransferStatus(get(clientControlTransfer)), 'Client control lost');
});
