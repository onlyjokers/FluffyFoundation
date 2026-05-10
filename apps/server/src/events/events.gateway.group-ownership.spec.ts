/**
 * Purpose: FF-12 server ingress tests for Group ownership enforcement and Root emergency authority.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventsGateway } from './events.gateway.js';

function createGateway() {
  const routed: unknown[] = [];
  const gateway = new EventsGateway(
    {
      onClientExpired: () => () => undefined,
      isManager: () => true,
      getDisplayDescriptors: () => [],
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
      reclaimGroupOwnership: (groupId: string, actor: unknown) => ({
        groupId,
        owner: actor,
        ownerStack: [{ actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] }],
        transferable: true,
        surface: 'public',
        visibility: { defaultAccess: 'visible-readonly' },
        selectedClientIds: ['client-1'],
      }),
      releaseGroupOwnership: () => undefined,
      archiveGroupOwnership: () => undefined,
      restoreGroupOwnership: () => undefined,
    } as never,
    { routeMessage: (message: unknown) => routed.push(message) } as never
  );
  return { gateway, routed };
}

function captureWarns(fn: () => void): unknown[][] {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

function loggedMetadata(warnings: unknown[][]): Record<string, unknown> {
  const value = warnings[0]?.[1];
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function commandEnvelope(actor: string, role = 'manager') {
  return {
    actor,
    role,
    scopeGroupId: 'stage-left',
    correlationId: `corr-${actor}`,
    idempotencyKey: `idem-${actor}`,
  };
}

test('server denies non-owner mutating Group commands with structured policy error', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        action: 'vibrate',
        payload: { pattern: [100] },
        ...commandEnvelope('manager-b'),
      },
      { id: 'socket-non-owner' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.ownership_denied');
  assert.equal(loggedMetadata(warnings).scope, 'server.ingress.groupOwnership');
});

test('server routes Manager reclaim command for transferable Group', () => {
  const { gateway, routed } = createGateway();
  gateway.handleMessage(
    {
      type: 'plugin',
      version: 1,
      from: 'manager',
      target: { mode: 'group', groupId: 'stage-left' },
      pluginId: 'node-executor',
      command: 'reclaim',
      payload: {},
      ...commandEnvelope('manager-b'),
    },
    { id: 'socket-reclaim' } as never
  );

  assert.equal(routed.length, 1);
});

test('server rejects retired Root stop-all emergency authority', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        action: 'shutdown',
        payload: { reason: 'root-stop-all' },
        actor: 'root',
        role: 'root',
        scopeGroupId: '__root_emergency__',
        correlationId: 'corr-root-stop',
        idempotencyKey: 'idem-root-stop',
      },
      { id: 'socket-root' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.root_retired');
});

test('server allows Manager scoped shutdown through normal ownership policy', () => {
  const { gateway, routed } = createGateway();
  gateway.handleMessage(
    {
      type: 'control',
      version: 1,
      from: 'manager',
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'shutdown',
      payload: { reason: 'manager-stop' },
      ...commandEnvelope('manager-a'),
    },
    { id: 'socket-manager-stop' } as never
  );

  assert.equal(routed.length, 1);
});
