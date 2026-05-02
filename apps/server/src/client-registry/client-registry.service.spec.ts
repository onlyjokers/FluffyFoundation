/**
 * Purpose: FF-06 tests for registry-owned control-plane snapshots.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClientRegistryService } from './client-registry.service.js';
import { createControlPlaneSnapshot } from '../bootstrap/control-plane-snapshot.js';

test('getControlPlaneSnapshot exposes selected client ownership from the registry', () => {
  const registry = new ClientRegistryService();
  registry.registerConnection('socket-1', 'client', undefined, {
    deviceId: 'client-1',
    instanceId: 'tab-1',
  });
  registry.setClientGroup('client-1', 'stage-left');
  registry.setClientSelected('client-1', true);

  assert.deepEqual(createControlPlaneSnapshot(registry.getAllClients()), {
    strategy: 'single-server',
    selection: {
      selectedClientIds: ['client-1'],
      revision: 1772679219,
    },
    ownership: {
      'stage-left': {
        owner: 'server-process',
        selectedClientIds: ['client-1'],
      },
    },
  });
});
