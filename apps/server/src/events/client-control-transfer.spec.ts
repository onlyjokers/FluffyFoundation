/**
 * Purpose: Regression coverage that client-as-controller transfer is retired from server ingress.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventsGateway } from './events.gateway.js';

function createGateway() {
  const routed: unknown[] = [];
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
    { routeMessage: (message: unknown) => routed.push(message) } as never
  );
  return { gateway, routed };
}

test('server rejects client mutating control without any transfer exception path', () => {
  const { gateway, routed } = createGateway();
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
  assert.equal((warnings[0]?.[1] as { code?: string }).code, 'server.policy.manager_required');
});

test('server rejects retired client control transfer action from managers', () => {
  const { gateway, routed } = createGateway();
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
        action: 'clientControlTransfer',
        payload: {
          kind: 'client-control-transfer',
          action: 'offer',
          groupId: 'stage-left',
          targetClientId: 'client-1',
        },
        actor: 'manager-a',
        role: 'manager',
        scopeGroupId: 'stage-left',
        correlationId: 'corr-transfer',
        idempotencyKey: 'idem-transfer',
      },
      { id: 'socket-manager' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal((warnings[0]?.[1] as { code?: string }).code, 'protocol.field.invalid');
});
