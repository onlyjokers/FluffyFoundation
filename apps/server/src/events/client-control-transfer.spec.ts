/**
 * Purpose: FF-13 server tests for client-as-controller transfer lifecycle and scoped ownership.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClientControlTransferService } from './client-control-transfer.js';
import { EventsGateway } from './events.gateway.js';
import type { ClientControlTransferOffer } from '@shugu/protocol';

function createTransferService(nowRef: { now: number }) {
  const ownershipChanges: unknown[] = [];
  const statusEvents: ClientControlTransferOffer[] = [];
  const registry = {
    getGroupOwnershipEntry: (groupId: string) => ({
      groupId,
      owner: { actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
      ownerStack: [],
      transferable: true,
      surface: 'public',
      visibility: { defaultAccess: 'visible-readonly' },
      selectedClientIds: ['client-1'],
    }),
    reclaimGroupOwnership: (groupId: string, actor: unknown) => {
      ownershipChanges.push({ groupId, actor });
      return {
        groupId,
        owner: actor,
        ownerStack: [{ actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] }],
        transferable: true,
        surface: 'public',
        visibility: { defaultAccess: 'visible-readonly' },
        selectedClientIds: ['client-1'],
      };
    },
    releaseGroupOwnership: (groupId: string, actorId: string) => {
      ownershipChanges.push({ groupId, actorId, release: true });
      return undefined;
    },
  };
  const service = new ClientControlTransferService(registry as never, {
    now: () => nowRef.now,
    emitStatus: (status) => statusEvents.push(status),
    ttlMs: 100,
  });
  return { service, ownershipChanges, statusEvents };
}

test('client transfer offer expires before late acceptance can claim ownership', () => {
  const nowRef = { now: 1_000 };
  const { service, ownershipChanges, statusEvents } = createTransferService(nowRef);

  const offer = service.offer({
    groupId: 'stage-left',
    targetClientId: 'client-1',
    actor: { id: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
  });
  nowRef.now = 1_101;

  assert.equal(service.accept(offer.transferId, 'client-1').ok, false);
  assert.equal(ownershipChanges.length, 0);
  assert.equal(statusEvents.at(-1)?.status, 'expired');
});

test('client transfer accept, revoke, and disconnect recover prior Group owner stack', () => {
  const nowRef = { now: 1_000 };
  const { service, ownershipChanges, statusEvents } = createTransferService(nowRef);

  const accepted = service.accept(
    service.offer({
      groupId: 'stage-left',
      targetClientId: 'client-1',
      actor: { id: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
    }).transferId,
    'client-1'
  );

  assert.equal(accepted.ok, true);
  assert.equal((ownershipChanges[0] as { actor?: { id?: string } }).actor?.id, 'client-1');

  service.revoke(accepted.offer.transferId, 'manager-a');
  assert.equal((ownershipChanges[1] as { release?: boolean }).release, true);
  assert.equal(statusEvents.at(-1)?.status, 'revoked');

  const acceptedAgain = service.accept(
    service.offer({
      groupId: 'stage-left',
      targetClientId: 'client-1',
      actor: { id: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
    }).transferId,
    'client-1'
  );
  service.handleClientDisconnected('client-1');

  assert.equal(acceptedAgain.ok, true);
  assert.equal((ownershipChanges.at(-1) as { release?: boolean }).release, true);
  assert.equal(statusEvents.at(-1)?.status, 'control-lost');
});

function createGatewayWithTransfer() {
  const nowRef = { now: 1_000 };
  const routed: unknown[] = [];
  const { service } = createTransferService(nowRef);
  const gateway = new EventsGateway(
    {
      onClientExpired: () => () => undefined,
      isManager: (socketId: string) => socketId === 'socket-manager',
      getClientIdBySocketId: (socketId: string) => (socketId === 'socket-client' ? 'client-1' : 'manager-a'),
      getGroupOwnershipEntry: (groupId: string) =>
        groupId === 'stage-left'
          ? {
              groupId,
              owner: { actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
              ownerStack: [],
              transferable: true,
              surface: 'public',
              visibility: { defaultAccess: 'visible-readonly' },
              selectedClientIds: ['client-1'],
            }
          : undefined,
    } as never,
    { routeMessage: (message: unknown) => routed.push(message) } as never,
    service
  );
  return { gateway, routed };
}

test('server rejects client control without an accepted transfer capability', () => {
  const { gateway, routed } = createGatewayWithTransfer();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        action: 'vibrate',
        payload: { pattern: [25] },
        actor: 'client-1',
        role: 'client',
        scopeGroupId: 'stage-left',
        correlationId: 'corr-client',
        idempotencyKey: 'idem-client',
      },
      { id: 'socket-client' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal((warnings[0]?.[1] as { code?: string }).code, 'server.policy.client_transfer_required');
});
