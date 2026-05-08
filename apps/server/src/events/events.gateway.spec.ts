/**
 * Purpose: FF-03 ingress rejection tests for schema-backed runtime protocol validation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventsGateway } from './events.gateway.js';

function createGateway(overrides?: { isManager?: boolean }) {
  const clientRegistry = {
    onClientExpired: () => () => undefined,
    isManager: () => overrides?.isManager ?? false,
  };
  const routed: unknown[] = [];
  const messageRouter = {
    routeMessage: (message: unknown) => routed.push(message),
  };

  const gateway = new EventsGateway(clientRegistry as never, messageRouter as never);
  return { gateway, routed };
}

function loggedMetadata(warnings: unknown[][], index = 0): Record<string, unknown> {
  const value = warnings[index]?.[1];
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createConnectionGateway() {
  let registeredRole: string | null = null;
  const groupAssignments: { clientId: string; group: string }[] = [];
  const clientRegistry = {
    onClientExpired: () => () => undefined,
    registerConnection: (_socketId: string, role: string) => {
      registeredRole = role;
      return { clientId: 'registered-1', isNewClient: true };
    },
    setClientGroup: (clientId: string, group: string) => {
      groupAssignments.push({ clientId, group });
    },
    getClient: () => ({ selected: false }),
  };
  const messageRouter = {
    sendRegistrationConfirmation: () => undefined,
    notifyClientJoined: () => undefined,
    broadcastClientListUpdate: () => undefined,
    setServer: () => undefined,
    routeMessage: () => undefined,
  };

  const gateway = new EventsGateway(clientRegistry as never, messageRouter as never);
  gateway.server = { sockets: { sockets: new Map() } } as never;

  return { gateway, getRegisteredRole: () => registeredRole, groupAssignments };
}

test('handleMessage rejects schema-invalid messages before routing and logs structured reasons', () => {
  const { gateway, routed } = createGateway({ isManager: true });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        action: 'vibrate',
        scopeGroupId: 'stage-left',
        actor: 'manager',
        role: 'manager',
        correlationId: 'corr-invalid',
        idempotencyKey: 'idem-invalid',
      },
      { id: 'socket-1' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.[0], '[Gateway] Message rejected');
  assert.deepEqual(loggedMetadata(warnings), {
    socketId: 'socket-1',
    actor: 'manager',
    scope: 'message.control.payload',
    type: 'control',
    path: 'payload',
    decision: 'reject',
    code: 'protocol.field.required',
    message: 'payload is required',
  });
});

test('handleMessage rejects unauthorized routing with structured policy metadata', () => {
  const { gateway, routed } = createGateway({ isManager: false });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        pluginId: 'node-executor',
        command: 'deploy',
        payload: {},
        scopeGroupId: 'stage-left',
        actor: 'manager',
        role: 'manager',
        correlationId: 'corr-unauthorized',
        idempotencyKey: 'idem-unauthorized',
      },
      { id: 'socket-2' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.[0], '[Gateway] Message rejected');
  assert.deepEqual(loggedMetadata(warnings), {
    socketId: 'socket-2',
    actor: 'manager',
    scope: 'server.ingress.authorization',
    type: 'plugin',
    path: 'from',
    decision: 'reject',
    code: 'server.policy.unauthorized',
    message: 'manager role is required for plugin messages',
  });
});

test('handleConnection denies requested manager role by default when no secure key is configured', () => {
  withEnv(
    {
      SHUGU_MANAGER_KEY: undefined,
      SHUGU_ALLOW_INSECURE_MANAGER: undefined,
      NODE_ENV: undefined,
    },
    () => {
      const { gateway, getRegisteredRole } = createConnectionGateway();

      gateway.handleConnection({
        id: 'socket-manager-no-key',
        handshake: {
          query: { role: 'manager' },
          headers: {},
          auth: {},
          address: '203.0.113.10',
        },
      } as never);

      assert.equal(getRegisteredRole(), 'client');
    }
  );
});

test('handleConnection denies requested manager role when configured key is wrong', () => {
  withEnv(
    {
      SHUGU_MANAGER_KEY: 'secure-manager-key-123',
      SHUGU_ALLOW_INSECURE_MANAGER: undefined,
      NODE_ENV: undefined,
    },
    () => {
      const { gateway, getRegisteredRole } = createConnectionGateway();

      gateway.handleConnection({
        id: 'socket-manager-wrong-key',
        handshake: {
          query: { role: 'manager' },
          headers: {},
          auth: { managerKey: 'wrong-key' },
          address: '203.0.113.10',
        },
      } as never);

      assert.equal(getRegisteredRole(), 'client');
    }
  );
});

test('handleConnection allows explicit local insecure manager mode for local development only', () => {
  withEnv(
    {
      SHUGU_MANAGER_KEY: undefined,
      SHUGU_ALLOW_INSECURE_MANAGER: '1',
      NODE_ENV: 'development',
    },
    () => {
      const { gateway, getRegisteredRole } = createConnectionGateway();

      gateway.handleConnection({
        id: 'socket-manager-local-insecure',
        handshake: {
          query: { role: 'manager' },
          headers: {},
          auth: {},
          address: '127.0.0.1',
        },
      } as never);

      assert.equal(getRegisteredRole(), 'manager');
    }
  );
});

test('handleConnection assigns normal clients to their managed per-client group by default', () => {
  const { gateway, groupAssignments } = createConnectionGateway();

  gateway.handleConnection({
    id: 'socket-client-default-group',
    handshake: {
      query: {},
      headers: {},
      auth: {},
      address: '127.0.0.1',
    },
  } as never);

  assert.deepEqual(groupAssignments, [{ clientId: 'registered-1', group: 'client:registered-1' }]);
});

test('handleConnection preserves explicit client groups instead of replacing them with managed groups', () => {
  const { gateway, groupAssignments } = createConnectionGateway();

  gateway.handleConnection({
    id: 'socket-client-explicit-group',
    handshake: {
      query: { group: 'stage-left' },
      headers: {},
      auth: {},
      address: '127.0.0.1',
    },
  } as never);

  assert.deepEqual(groupAssignments, [{ clientId: 'registered-1', group: 'stage-left' }]);
});
