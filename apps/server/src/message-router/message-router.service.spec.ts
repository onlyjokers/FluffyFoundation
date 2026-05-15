/**
 * Purpose: FF-07 deterministic tests for server delivery classes, backpressure, and metrics.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createControlMessage,
  createSemanticMessage,
  createSemanticResultMessage,
  createSensorDataMessage,
  type Message,
} from '@shugu/protocol';
import { MessageRouterService } from './message-router.service.js';

const envelope = {
  actor: 'manager-1',
  role: 'manager' as const,
  scopeGroupId: 'stage-left',
  correlationId: 'corr-1',
  idempotencyKey: 'idem-1',
};

function createRouter(clientCount = 51, managerCount = 1) {
  const reliableMessages: Message[] = [];
  const volatileMessages: Message[] = [];
  const clientSocketIds = Array.from({ length: clientCount }, (_, index) => `client-socket-${index}`);
  const managerSocketIds = Array.from({ length: managerCount }, (_, index) => `manager-socket-${index}`);
  const registry = {
    getAllClientSocketIds: () => clientSocketIds,
    getAllManagerSocketIds: () => managerSocketIds,
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: (_groupId: string) =>
      clientSocketIds.map((socketId, index) => ({ clientId: `client-${index}`, socketId })),
  };
  const router = new MessageRouterService(registry as never);
  const server = {
    to: (_socketIds: string[]) => ({
      emit: (_event: string, message: Message) => reliableMessages.push(message),
    }),
    volatile: {
      to: (_socketIds: string[]) => ({
        emit: (_event: string, message: Message) => volatileMessages.push(message),
      }),
    },
  };
  router.setServer(server as never);
  return { router, reliableMessages, volatileMessages };
}

test('MessageRouterService drops volatile telemetry under backpressure and records metrics', () => {
  const { router, reliableMessages } = createRouter();

  router.routeMessage(createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 2, gamma: 3 }), 'socket-client-1');

  assert.equal(reliableMessages.length, 0);
  assert.equal(router.getDeliveryMetrics().dropped, 1);
});

test('MessageRouterService routes semantic graph commands only to manager sockets', () => {
  const { router, reliableMessages } = createRouter(3, 2);

  router.routeMessage(
    createSemanticMessage({
      target: { mode: 'manager' },
      actor: 'cli',
      role: 'manager',
      command: {
        kind: 'node.params.update',
        nodeId: 'tone-1',
        param: 'volume',
        value: 0.5,
      },
      requestId: 'semantic-route-1',
    }),
    'socket-manager-1'
  );

  assert.equal(reliableMessages.length, 1);
  assert.equal(reliableMessages[0]?.type, 'semantic');
  assert.equal((reliableMessages[0] as { requestId?: string }).requestId, 'semantic-route-1');
});

test('MessageRouterService routes semantic results back to the original requester socket', () => {
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const managerSocketIds = ['manager-ui-socket', 'cli-socket'];
  const registry = {
    getAllClientSocketIds: () => [],
    getAllManagerSocketIds: () => managerSocketIds,
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: () => [],
  };
  const router = new MessageRouterService(registry as never);
  const server = {
    to: (socketIds: string[]) => ({
      emit: (_event: string, message: Message) => delivered.push({ socketIds, message }),
    }),
    volatile: {
      to: (socketIds: string[]) => ({
        emit: (_event: string, message: Message) => delivered.push({ socketIds, message }),
      }),
    },
  };
  router.setServer(server as never);

  router.routeMessage(
    createSemanticMessage({
      target: { mode: 'manager' },
      actor: 'cli',
      role: 'manager',
      command: { kind: 'node.add', node: { id: 'cli-node', type: 'number' } },
      requestId: 'semantic-cli-request-1',
    }),
    'cli-socket'
  );
  router.routeMessage(
    createSemanticResultMessage({
      requestId: 'semantic-cli-request-1',
      ok: true,
      result: { accepted: true },
    }),
    'manager-ui-socket'
  );

  assert.deepEqual(delivered[0]?.socketIds, managerSocketIds);
  assert.deepEqual(delivered[1]?.socketIds, ['cli-socket']);
  assert.equal(delivered[1]?.message.type, 'semantic-result');
});

test('MessageRouterService keeps reliable and scheduled commands out of volatile throttling', async () => {
  const { router, reliableMessages, volatileMessages } = createRouter();

  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'playMedia', { url: '/reliable.mp4' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(
      envelope,
      { mode: 'group', groupId: 'stage-left' },
      'screenColor',
      { color: '#scheduled' },
      123456
    ),
    'socket-manager-1'
  );

  assert.equal(volatileMessages.length, 0);
  assert.deepEqual(
    reliableMessages.map((message) => ({
      action: (message as { action?: string }).action,
      color: (message as { payload?: { color?: string } }).payload?.color,
    })),
    [
      { action: 'screenColor', color: '#111111' },
      { action: 'playMedia', color: undefined },
      { action: 'screenColor', color: '#scheduled' },
    ]
  );

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(
    reliableMessages.map((message) => ({
      action: (message as { action?: string }).action,
      color: (message as { payload?: { color?: string } }).payload?.color,
    })),
    [
      { action: 'screenColor', color: '#111111' },
      { action: 'playMedia', color: undefined },
      { action: 'screenColor', color: '#scheduled' },
      { action: 'screenColor', color: '#222222' },
    ]
  );
  assert.equal(router.getDeliveryMetrics().coalesced, 1);
  assert.equal(router.getDeliveryMetrics().delivered, 4);
});

test('MessageRouterService replays the final latest-state value without a later command', async () => {
  const { router, reliableMessages } = createRouter();

  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' }),
    'socket-manager-1'
  );

  assert.deepEqual(
    reliableMessages.map((message) => (message as { payload?: { color?: string } }).payload?.color),
    ['#111111']
  );

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(
    reliableMessages.map((message) => (message as { payload?: { color?: string } }).payload?.color),
    ['#111111', '#222222']
  );
  assert.equal(router.getDeliveryMetrics().coalesced, 1);
  assert.equal(router.getDeliveryMetrics().delivered, 2);
});

test('MessageRouterService replaces same-key pending latest-state without delivering the previous pending value', async () => {
  const { router, reliableMessages } = createRouter();

  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#333333' }),
    'socket-manager-1'
  );

  assert.deepEqual(
    reliableMessages.map((message) => (message as { payload?: { color?: string } }).payload?.color),
    ['#111111']
  );

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(
    reliableMessages.map((message) => (message as { payload?: { color?: string } }).payload?.color),
    ['#111111', '#333333']
  );
  assert.equal(router.getDeliveryMetrics().coalesced, 2);
  assert.equal(router.getDeliveryMetrics().delivered, 2);
});

test('MessageRouterService records late latest-state replay metrics', async () => {
  const { router } = createRouter();
  (router as unknown as { minBroadcastIntervalMs: number }).minBroadcastIntervalMs = 1;

  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#111111' }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', { color: '#222222' }),
    'socket-manager-1'
  );

  const blockUntil = Date.now() + 20;
  while (Date.now() < blockUntil) {
    // Force the replay timer to run after its due window so late metrics are deterministic.
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(router.getDeliveryMetrics().late, 1);
});
