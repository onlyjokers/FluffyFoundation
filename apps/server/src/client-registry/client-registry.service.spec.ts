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
        groupId: 'stage-left',
        owner: {
          actorId: 'server-process',
          role: 'service',
          capabilities: ['group.view', 'partition.deploy', 'partition.stop'],
        },
        ownerStack: [],
        transferable: true,
        surface: 'public',
        visibility: { defaultAccess: 'visible-readonly' },
        archived: undefined,
        selectedClientIds: ['client-1'],
      },
    },
  });
});

test('getClientsByGroup resolves managed client aliases even when a client has an explicit group', () => {
  const registry = new ClientRegistryService();
  registry.registerConnection('socket-display', 'client', 'Display user agent', {
    deviceId: 'display-1',
    instanceId: 'tab-display',
  });
  registry.setClientGroup('display-1', 'display');

  assert.deepEqual(
    registry.getClientsByGroup('display').map((client) => client.clientId),
    ['display-1']
  );
  assert.deepEqual(
    registry.getClientsByGroup('client:display-1').map((client) => client.clientId),
    ['display-1']
  );
});

test('client registry stores permission snapshots on client info', () => {
  const registry = new ClientRegistryService();
  registry.registerConnection('socket-1', 'client', undefined, {
    deviceId: 'client-1',
    instanceId: 'tab-1',
  });

  registry.setClientPermissions('client-1', {
    microphone: 'granted',
    motion: 'denied',
    camera: 'pending',
  });

  assert.deepEqual(registry.getAllClients()[0]?.permissions, {
    microphone: 'granted',
    motion: 'denied',
    camera: 'pending',
  });
});
