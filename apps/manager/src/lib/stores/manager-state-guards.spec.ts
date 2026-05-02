// Purpose: regression tests for optional ManagerState fields used by manager-only UI features.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getControlPlaneOwnership } from './manager-state-guards';

test('getControlPlaneOwnership returns an empty map when controlPlane is absent', () => {
  const ownership = getControlPlaneOwnership({
    status: 'disconnected',
    managerId: null,
    clients: [],
    selectedClientIds: [],
    timeSync: {
      offset: 0,
      samples: [],
      maxSamples: 10,
      initialized: false,
      lastSyncTime: 0,
    },
    error: null,
  });

  assert.deepEqual(ownership, {});
});
