// Purpose: Unit tests for MessageRouterService broadcast recipients.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MessageRouterService } from './message-router.service.js';

type FakeSocketRoom = {
  emit: (event: string, payload: unknown) => void;
};

type FakeServer = {
  to: (socketIds: string[] | string) => FakeSocketRoom;
};

test('MessageRouterService: broadcastClientListUpdate sends to managers and controller group', () => {
  const allClients = [
    { clientId: 'c1', connectedAt: 1, lastSeenAt: 1, selected: false, connected: true },
  ];

  const managerSocketIds = ['m-s1'];
  const controllerClients = [{ socketId: 'c-s1' }, { socketId: 'c-s2' }];

  const clientRegistry = {
    getAllClients: () => allClients,
    getAllManagerSocketIds: () => managerSocketIds,
    getClientsByGroup: (groupId: string) => {
      if (groupId === 'controller') return controllerClients;
      return [];
    },
  };

  const svc = new MessageRouterService(clientRegistry as never);

  const emitted: Array<{ socketIds: string[]; message: any }> = [];
  const server: FakeServer = {
    to: (socketIds) => {
      const list = Array.isArray(socketIds) ? socketIds : [socketIds];
      return {
        emit: (event, payload) => {
          emitted.push({ socketIds: list, message: payload });
          assert.equal(event, 'msg');
        },
      };
    },
  };

  svc.setServer(server as never);
  svc.broadcastClientListUpdate();

  assert.equal(emitted.length, 1);

  const recipients = emitted[0].socketIds.slice().sort();
  assert.deepEqual(recipients, ['c-s1', 'c-s2', 'm-s1'].sort());

  assert.equal(emitted[0].message.type, 'system');
  assert.equal(emitted[0].message.action, 'clientList');
  assert.ok(Array.isArray(emitted[0].message.payload?.clients));
});

test('MessageRouterService: broadcastClientListUpdate de-dupes recipient sockets', () => {
  const allClients: any[] = [];
  const managerSocketIds = ['s1'];
  const controllerClients = [{ socketId: 's1' }, { socketId: 's2' }];

  const clientRegistry = {
    getAllClients: () => allClients,
    getAllManagerSocketIds: () => managerSocketIds,
    getClientsByGroup: (groupId: string) => {
      if (groupId === 'controller') return controllerClients;
      return [];
    },
  };

  const svc = new MessageRouterService(clientRegistry as never);

  const emitted: Array<{ socketIds: string[] }> = [];
  const server: FakeServer = {
    to: (socketIds) => {
      const list = Array.isArray(socketIds) ? socketIds : [socketIds];
      return {
        emit: () => {
          emitted.push({ socketIds: list });
        },
      };
    },
  };

  svc.setServer(server as never);
  svc.broadcastClientListUpdate();

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].socketIds.slice().sort(), ['s1', 's2'].sort());
});
