/**
 * Purpose: FF-03 ingress rejection tests for schema-backed runtime protocol validation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventsGateway } from './events.gateway.js';
import { ManagerAuthService } from '../manager-auth/manager-auth.service.js';

function createGateway(overrides?: { isManager?: boolean }) {
  const clientRegistry = {
    onClientExpired: () => () => undefined,
    isManager: () => overrides?.isManager ?? false,
  };
  const routed: unknown[] = [];
  const messageRouter = {
    routeMessage: (message: unknown) => routed.push(message),
  };

  const gateway = new EventsGateway(clientRegistry as never, messageRouter as never, new ManagerAuthService());
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
  let registeredIdentity: Record<string, unknown> | null = null;
  const groupAssignments: { clientId: string; group: string }[] = [];
  const clientRegistry = {
    onClientExpired: () => () => undefined,
    registerConnection: (_socketId: string, role: string, _userAgent?: string, identity?: Record<string, unknown>) => {
      registeredRole = role;
      registeredIdentity = identity ?? null;
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

  const gateway = new EventsGateway(clientRegistry as never, messageRouter as never, new ManagerAuthService());
  gateway.server = { sockets: { sockets: new Map() } } as never;

  return { gateway, getRegisteredRole: () => registeredRole, getRegisteredIdentity: () => registeredIdentity, groupAssignments };
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

test('handleMessage records client permission snapshots by socket identity', () => {
  const permissionUpdates: unknown[] = [];
  let broadcastCount = 0;
  const clientRegistry = {
    onClientExpired: () => () => undefined,
    isManager: () => false,
    getClientIdBySocketId: (socketId: string) => (socketId === 'socket-client-1' ? 'client-1' : undefined),
    setClientPermissions: (clientId: string, permissions: unknown) => {
      permissionUpdates.push({ clientId, permissions });
    },
  };
  const messageRouter = {
    routeMessage: () => undefined,
    broadcastClientListUpdate: () => {
      broadcastCount += 1;
    },
  };
  const gateway = new EventsGateway(clientRegistry as never, messageRouter as never, new ManagerAuthService());

  gateway.handleMessage(
    {
      type: 'system',
      version: 1,
      action: 'clientPermissions',
      payload: {
        clientId: 'spoofed-client',
        permissions: {
          microphone: 'granted',
          motion: 'denied',
        },
      },
    },
    { id: 'socket-client-1' } as never
  );

  assert.deepEqual(permissionUpdates, [
    {
      clientId: 'client-1',
      permissions: {
        microphone: 'granted',
        motion: 'denied',
      },
    },
  ]);
  assert.equal(broadcastCount, 1);
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
    code: 'server.policy.manager_required',
    message: 'manager role is required for plugin messages',
  });
});

test('handleMessage rejects semantic graph commands from non-manager sockets', () => {
  const { gateway, routed } = createGateway({ isManager: false });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    gateway.handleMessage(
      {
        type: 'semantic',
        version: 1,
        target: { mode: 'manager' },
        actor: 'cli',
        role: 'manager',
        command: {
          kind: 'node.params.update',
          nodeId: 'tone-1',
          param: 'volume',
          value: 0.5,
        },
        requestId: 'semantic-unauthorized',
      },
      { id: 'socket-client-1' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal(warnings.length, 1);
  assert.deepEqual(loggedMetadata(warnings), {
    socketId: 'socket-client-1',
    actor: 'cli',
    scope: 'server.ingress.authorization',
    type: 'semantic',
    path: 'role',
    decision: 'reject',
    code: 'server.policy.manager_required',
    message: 'manager role is required for semantic messages',
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

test('handleConnection grants manager role with a valid Manager session cookie before checking legacy manager key', () => {
  withEnv(
    {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
      SHUGU_MANAGER_KEY: 'legacy-manager-key',
      SHUGU_ALLOW_INSECURE_MANAGER: undefined,
      NODE_ENV: undefined,
    },
    () => {
      const { gateway, getRegisteredRole } = createConnectionGateway();
      const login = gateway.managerAuth.login({ username: 'Eureka', password: 'secret-password' });
      assert.equal(login.ok, true);

      gateway.handleConnection({
        id: 'socket-manager-session',
        handshake: {
          query: { role: 'manager' },
          headers: { cookie: login.cookie },
          auth: { managerKey: 'wrong-key' },
          address: '203.0.113.10',
        },
      } as never);

      assert.equal(getRegisteredRole(), 'manager');
    }
  );
});

test('handleConnection denies requested manager role when configured key is wrong and no session is present', () => {
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

test('handleConnection passes url session identity from client auth or query to registry', () => {
  const { gateway, getRegisteredIdentity } = createConnectionGateway();

  gateway.handleConnection({
    id: 'socket-client-url-session',
    handshake: {
      query: { sessionId: 'query-session' },
      headers: {},
      auth: { deviceId: 'client-a', instanceId: 'tab-a', urlSessionId: 'auth-session' },
      address: '127.0.0.1',
    },
  } as never);

  assert.equal(getRegisteredIdentity()?.urlSessionId, 'auth-session');
});
