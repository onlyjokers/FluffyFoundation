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

const semanticSnapshot = {
  revision: 1,
  nodes: [],
  definitions: [],
  connections: [],
  groups: [],
  partitions: [],
  runtimeStatus: { running: false, deployedPartitionIds: [] },
  deviceCapabilities: [],
  errors: [],
  permissions: [],
};

const envelope = {
  actor: 'manager-1',
  role: 'manager' as const,
  scopeGroupId: 'stage-left',
  correlationId: 'corr-1',
  idempotencyKey: 'idem-1',
};

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(condition(), true);
};

function createRouter(clientCount = 51, managerCount = 1) {
  const reliableMessages: Message[] = [];
  const volatileMessages: Message[] = [];
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const clientSocketIds = Array.from(
    { length: clientCount },
    (_, index) => `client-socket-${index}`
  );
  const managerSocketIds = Array.from(
    { length: managerCount },
    (_, index) => `manager-socket-${index}`
  );
  const registry = {
    getAllClients: () =>
      clientSocketIds.map((socketId, index) => ({
        clientId: `client-${index}`,
        socketId,
      })),
    getAllClientSocketIds: () => clientSocketIds,
    getAllManagerSocketIds: () => managerSocketIds,
    getAllGroupOwnershipEntries: () => [],
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: (_groupId: string) =>
      clientSocketIds.map((socketId, index) => ({ clientId: `client-${index}`, socketId })),
  };
  const router = new MessageRouterService(registry as never);
  const server = {
    to: (socketIds: string[]) => ({
      emit: (_event: string, message: Message) => {
        reliableMessages.push(message);
        delivered.push({ socketIds, message });
      },
    }),
    volatile: {
      to: (socketIds: string[]) => ({
        emit: (_event: string, message: Message) => {
          volatileMessages.push(message);
          delivered.push({ socketIds, message });
        },
      }),
    },
  };
  router.setServer(server as never);
  return { router, reliableMessages, volatileMessages, delivered };
}

test('MessageRouterService drops volatile telemetry under backpressure and records metrics', () => {
  const { router, reliableMessages } = createRouter();

  router.routeMessage(
    createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 2, gamma: 3 }),
    'socket-client-1'
  );

  assert.equal(reliableMessages.length, 0);
  assert.equal(router.getDeliveryMetrics().dropped, 1);
});

test('MessageRouterService forwards ClientUI interaction sensor events to managers and wakes AI runtime', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const triggers: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { enqueue: (trigger: unknown) => void } }).aiAgentRuntime = {
    enqueue: (trigger) => triggers.push(trigger),
  };
  const info = console.info;
  const logs: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    router.routeMessage(
      createSensorDataMessage('client-1', 'custom', {
        kind: 'client-ui-interaction',
        nodeId: 'client-button-1',
        uiKind: 'button',
        pressed: true,
        inputContent: '',
        firstInputed: false,
      }),
      'socket-client-1'
    );
  } finally {
    console.info = info;
  }

  assert.equal(reliableMessages.length, 1);
  assert.equal(reliableMessages[0]?.type, 'data');
  assert.equal((reliableMessages[0] as { payload?: { kind?: string } }).payload?.kind, 'client-ui-interaction');
  assert.deepEqual(
    triggers.map((entry) => (entry as { event?: { type?: string; uiKind?: string; pressed?: boolean } }).event),
    [
      {
        type: 'client.ui.interaction',
        clientId: 'client-1',
        groupId: undefined,
        nodeId: 'client-button-1',
        uiKind: 'button',
        pressed: true,
        inputContent: '',
        firstInputed: false,
        recording: undefined,
        assetId: undefined,
        asset: undefined,
        finished: false,
      },
    ]
  );
  assert.equal(router.getDeliveryMetrics().rejected, 0);
  assert.deepEqual(logs, [
    [
      '[Gateway] ClientUI interaction',
      {
        clientId: 'client-1',
        nodeId: 'client-button-1',
        uiKind: 'button',
        pressed: true,
        firstInputed: false,
        managerCount: 1,
      },
    ],
  ]);
});

test('MessageRouterService forwards text input interactions without waking AI twice', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const triggers: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { enqueue: (trigger: unknown) => void } }).aiAgentRuntime = {
    enqueue: (trigger) => triggers.push(trigger),
  };
  const info = console.info;
  console.info = () => undefined;

  try {
    router.routeMessage(
      createSensorDataMessage('client-1', 'custom', {
        kind: 'client-ui-interaction',
        nodeId: 'client-input-1',
        uiKind: 'input',
        inputContent: 'hi',
        firstInputed: true,
      }),
      'socket-client-1'
    );
  } finally {
    console.info = info;
  }

  assert.equal(reliableMessages.length, 1);
  assert.equal((reliableMessages[0] as { payload?: { kind?: string } }).payload?.kind, 'client-ui-interaction');
  assert.deepEqual(triggers, []);
});

test('MessageRouterService forwards record interactions without waking AI before STT text arrives', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const triggers: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { enqueue: (trigger: unknown) => void } }).aiAgentRuntime = {
    enqueue: (trigger) => triggers.push(trigger),
  };
  const info = console.info;
  console.info = () => undefined;

  try {
    router.routeMessage(
      createSensorDataMessage('client-1', 'custom', {
        kind: 'client-ui-interaction',
        nodeId: 'client-record-1',
        uiKind: 'record',
        finished: true,
      }),
      'socket-client-1'
    );
  } finally {
    console.info = info;
  }

  assert.equal(reliableMessages.length, 1);
  assert.equal((reliableMessages[0] as { payload?: { kind?: string } }).payload?.kind, 'client-ui-interaction');
  assert.deepEqual(triggers, []);
});

test('MessageRouterService keeps the real client id when waking AI from agent text', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const triggers: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { enqueue: (trigger: unknown) => void } }).aiAgentRuntime = {
    enqueue: (trigger) => triggers.push(trigger),
  };

  router.routeMessage(
    createSensorDataMessage('client-1', 'custom', {
      kind: 'agent-text',
      text: 'hi',
    }),
    'socket-client-1'
  );

  assert.equal(reliableMessages.length, 1);
  assert.deepEqual(
    triggers.map((entry) => (entry as { event?: unknown }).event),
    [
      {
        type: 'client.text.final',
        clientId: 'client-1',
        groupId: undefined,
        text: 'hi',
      },
    ]
  );
});

test('MessageRouterService notifies managers about client joins without waking AI runtime', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const triggers: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { enqueue: (trigger: unknown) => void } }).aiAgentRuntime = {
    enqueue: (trigger) => triggers.push(trigger),
  };

  router.notifyClientJoined('client-1');

  assert.equal(
    reliableMessages.some((message) => message.type === 'system' && (message as { action?: string }).action === 'clientJoined'),
    true
  );
  assert.deepEqual(triggers, []);
});

test('MessageRouterService passes client screenshots to AI runtime capture waiters', () => {
  const { router, reliableMessages } = createRouter(1, 1);
  const screenshots: unknown[] = [];
  (router as unknown as { aiAgentRuntime?: { handleClientScreenshot: (input: unknown) => void } }).aiAgentRuntime = {
    handleClientScreenshot: (input) => screenshots.push(input),
  };

  router.routeMessage(
    createSensorDataMessage('client-1', 'custom', {
      kind: 'client-screenshot',
      dataUrl: 'data:image/webp;base64,abc',
      mime: 'image/webp',
      width: 100,
      height: 60,
      createdAt: 123,
    }),
    'socket-client-1'
  );

  assert.equal(reliableMessages.length, 1);
  assert.equal((reliableMessages[0] as { payload?: { kind?: string } }).payload?.kind, 'client-screenshot');
  assert.deepEqual(screenshots, [
    {
      clientId: 'client-1',
      dataUrl: 'data:image/webp;base64,abc',
      mime: 'image/webp',
      width: 100,
      height: 60,
      createdAt: 123,
    },
  ]);
});

test('MessageRouterService stores boolean variable updates on the server and broadcasts snapshots', () => {
  const { router, reliableMessages } = createRouter(2, 1);

  router.routeMessage(
    {
      type: 'system',
      version: 1,
      action: 'booleanVariables.update',
      payload: { updates: { visible: true } },
      clientTimestamp: Date.now(),
    },
    'client-socket-0'
  );

  const snapshots = reliableMessages.filter(
    (message) =>
      message.type === 'system' &&
      (message as { action?: string }).action === 'booleanVariables'
  );
  assert.equal(snapshots.length, 1);
  assert.deepEqual(
    (snapshots[0] as { payload?: { booleanVariables?: Record<string, boolean> } }).payload
      ?.booleanVariables,
    { visible: true }
  );
});

test('MessageRouterService scopes boolean variable snapshots to selected client ids', () => {
  const { router, delivered } = createRouter(2, 1);

  router.routeMessage(
    {
      type: 'system',
      version: 1,
      action: 'booleanVariables.update',
      payload: { updates: { visible: true }, clientIds: ['client-1'] },
      clientTimestamp: Date.now(),
    },
    'client-socket-0'
  );

  const snapshot = delivered.find(
    (entry) =>
      entry.message.type === 'system' &&
      (entry.message as { action?: string }).action === 'booleanVariables'
  );
  assert.deepEqual(snapshot?.socketIds, ['client-1-socket', 'manager-socket-0']);
});

test('MessageRouterService rebroadcasts boolean variables with client list updates', () => {
  const { router, reliableMessages } = createRouter(2, 1);

  router.routeMessage(
    {
      type: 'system',
      version: 1,
      action: 'booleanVariables.update',
      payload: { updates: { visible: true } },
      clientTimestamp: Date.now(),
    },
    'client-socket-0'
  );
  reliableMessages.length = 0;

  router.broadcastClientListUpdate();

  const snapshots = reliableMessages.filter(
    (message) =>
      message.type === 'system' &&
      (message as { action?: string }).action === 'booleanVariables'
  );
  assert.equal(snapshots.length, 1);
  assert.deepEqual(
    (snapshots[0] as { payload?: { booleanVariables?: Record<string, boolean> } }).payload
      ?.booleanVariables,
    { visible: true }
  );
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

test('MessageRouterService executes server semantic snapshot requests without manager broadcast', () => {
  const semanticCommands: unknown[] = [];
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const managerSocketIds = ['manager-ui-socket'];
  const registry = {
    getAllClientSocketIds: () => [],
    getAllManagerSocketIds: () => managerSocketIds,
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: () => [],
  };
  const semanticAuthority = {
    dispatch: (input: unknown) => {
      semanticCommands.push(input);
      return {
        ok: true,
        appliedRevision: 1,
        snapshot: semanticSnapshot,
        audit: { id: 'audit:1' },
        warnings: [],
      };
    },
  };
  const router = new MessageRouterService(registry as never, semanticAuthority as never);
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
      target: { mode: 'server' },
      actor: 'cli',
      role: 'manager',
      command: { kind: 'graph.snapshot' },
      requestId: 'semantic-server-request-1',
    }),
    'cli-socket'
  );

  assert.equal(semanticCommands.length, 1);
  assert.deepEqual(delivered[0]?.socketIds, ['cli-socket']);
  assert.equal(delivered[0]?.message.type, 'semantic-result');
  assert.equal(delivered.length, 1);
});

test('MessageRouterService broadcasts semantic snapshots after server-owned mutations', () => {
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const managerSocketIds = ['manager-ui-socket'];
  const registry = {
    getAllClientSocketIds: () => [],
    getAllManagerSocketIds: () => managerSocketIds,
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: () => [],
  };
  const semanticAuthority = {
    dispatch: () => ({
      ok: true,
      appliedRevision: 2,
      snapshot: semanticSnapshot,
      audit: { id: 'audit:2' },
      warnings: [],
    }),
  };
  const router = new MessageRouterService(registry as never, semanticAuthority as never);
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
      target: { mode: 'server' },
      actor: 'cli',
      role: 'manager',
      command: { kind: 'node.add', node: { id: 'cli-node', type: 'number' } },
      requestId: 'semantic-server-mutation-1',
    }),
    'cli-socket'
  );

  assert.deepEqual(delivered[0]?.socketIds, ['cli-socket']);
  assert.equal(delivered[0]?.message.type, 'semantic-result');
  assert.deepEqual(delivered[1]?.socketIds, managerSocketIds);
  assert.equal(delivered[1]?.message.type, 'system');
  assert.equal((delivered[1]?.message as { action?: string }).action, 'semanticSnapshot');
});

test('MessageRouterService broadcasts semantic snapshots after AI agent mutations', async () => {
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const managerSocketIds = ['manager-ui-socket'];
  const aiSnapshot = {
    ...semanticSnapshot,
    revision: 8,
    nodes: [{ id: 'display:greeting', type: 'display-breathing', params: { intensity: 0.8 } }],
  };
  const registry = {
    getAllClientSocketIds: () => ['client-socket'],
    getAllManagerSocketIds: () => managerSocketIds,
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: () => [],
    getClient: () => ({ clientId: 'client-1', socketId: 'client-socket', group: 'ai-space:demo' }),
    getAllClients: () => [{ clientId: 'client-1', connected: true, group: 'ai-space:demo' }],
    getAllGroupOwnershipEntries: () => [],
  };
  const aiAgentRuntime = {
    enqueue: async () => {
      router.broadcastSemanticSnapshot(aiSnapshot);
    },
  };
  const router = new MessageRouterService(registry as never, undefined, undefined, undefined, aiAgentRuntime as never);
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
    createSensorDataMessage('client-1', 'custom', { kind: 'agent-text', text: 'hi' }),
    'socket-client-1'
  );
  await waitFor(() =>
    delivered.some(
      (entry) =>
        entry.message.type === 'system' &&
        (entry.message as { action?: string }).action === 'semanticSnapshot' &&
        (entry.message as { payload?: { semanticSnapshot?: { revision?: number } } }).payload
          ?.semanticSnapshot?.revision === 8
    )
  );

  const semanticSnapshotBroadcast = delivered.find(
    (entry) =>
      entry.message.type === 'system' &&
      (entry.message as { action?: string }).action === 'semanticSnapshot'
  );
  assert.deepEqual(semanticSnapshotBroadcast?.socketIds, managerSocketIds);
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
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#111111',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#222222',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'playMedia', {
      url: '/reliable.mp4',
    }),
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
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#111111',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#222222',
    }),
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
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#111111',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#222222',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#333333',
    }),
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
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#111111',
    }),
    'socket-manager-1'
  );
  router.routeMessage(
    createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
      color: '#222222',
    }),
    'socket-manager-1'
  );

  const blockUntil = Date.now() + 20;
  while (Date.now() < blockUntil) {
    // Force the replay timer to run after its due window so late metrics are deterministic.
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(router.getDeliveryMetrics().late, 1);
});
