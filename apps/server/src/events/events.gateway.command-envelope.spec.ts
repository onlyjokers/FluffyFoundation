/**
 * Purpose: FF-05 ingress tests for scoped command-envelope enforcement and audit records.
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
    } as never,
    { routeMessage: (message: unknown) => routed.push(message) } as never
  );
  return { gateway, routed };
}

function loggedMetadata(warnings: unknown[][]): Record<string, unknown> {
  const value = warnings[0]?.[1];
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function captureWarns(fn: () => void): unknown[][] {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

function envelope() {
  return {
    scopeGroupId: 'stage-left',
    actor: 'manager',
    role: 'manager',
    correlationId: 'corr-1',
    idempotencyKey: 'idem-1',
  };
}

test('handleMessage rejects manager control messages with missing scope before routing', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        action: 'vibrate',
        payload: { pattern: [100] },
        actor: 'manager',
        role: 'manager',
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
      },
      { id: 'socket-missing-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).scope, 'message.command.scopeGroupId');
  assert.equal(loggedMetadata(warnings).path, 'scopeGroupId');
});

test('handleMessage rejects manager control messages with wrong target group scope', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-right' },
        action: 'vibrate',
        payload: { pattern: [100] },
        ...envelope(),
      },
      { id: 'socket-wrong-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.scope_mismatch');
  assert.equal(loggedMetadata(warnings).path, 'target.groupId');
});

test('handleMessage rejects scoped manager commands targeting all clients', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        action: 'vibrate',
        payload: { pattern: [100] },
        ...envelope(),
      },
      { id: 'socket-all-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.scope_mismatch');
  assert.equal(loggedMetadata(warnings).path, 'target.mode');
});

test('handleMessage rejects scoped manager commands targeting explicit client IDs', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'clientIds', ids: ['client-1'] },
        pluginId: 'node-executor',
        command: 'deploy',
        payload: {},
        ...envelope(),
      },
      { id: 'socket-clientIds-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.scope_mismatch');
  assert.equal(loggedMetadata(warnings).path, 'target.mode');
});

test('handleMessage accepts node executor deploy commands scoped to a managed client group', () => {
  const { gateway, routed } = createGateway();
  const audits: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    audits.push(args);
  };
  try {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'client:client-1' },
        pluginId: 'node-executor',
        command: 'deploy',
        payload: {
          graph: { nodes: [], connections: [] },
          meta: {
            loopId: 'loop:client-node',
            requiredCapabilities: ['flashlight', 'sensors'],
            tickIntervalMs: 100,
            protocolVersion: 1,
            executorVersion: 'node-executor-v1',
          },
        },
        scopeGroupId: 'client:client-1',
        actor: 'manager',
        role: 'manager',
        correlationId: 'corr-managed-client',
        idempotencyKey: 'idem-managed-client',
      },
      { id: 'socket-managed-client' } as never
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(routed.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.[0], '[Gateway] Command audit');
  assert.deepEqual(audits[0]?.[1], {
    actor: 'manager',
    role: 'manager',
    scopeGroupId: 'client:client-1',
    type: 'plugin',
    command: 'deploy',
    target: { mode: 'group', groupId: 'client:client-1' },
    correlationId: 'corr-managed-client',
    idempotencyKey: 'idem-managed-client',
    decision: 'accept',
  });
});

test('handleMessage rejects media messages with missing scope before routing', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'media',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        mediaType: 'audio',
        url: '/media/demo.mp3',
        executeAt: 123,
        actor: 'manager',
        role: 'manager',
        correlationId: 'corr-media',
        idempotencyKey: 'idem-media',
      },
      { id: 'socket-media-missing-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).scope, 'message.command.scopeGroupId');
  assert.equal(loggedMetadata(warnings).path, 'scopeGroupId');
});

test('handleMessage rejects manager control messages with ambiguous scope aliases', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'all' },
        action: 'vibrate',
        payload: { pattern: [100] },
        scope: { scopeGroupId: 'stage-right' },
        ...envelope(),
      },
      { id: 'socket-ambiguous-scope' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'protocol.scope.ambiguous');
  assert.equal(loggedMetadata(warnings).path, 'scope.scopeGroupId');
});

test('handleMessage audits accepted mutating manager commands', () => {
  const { gateway, routed } = createGateway();
  const audits: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    audits.push(args);
  };
  try {
    gateway.handleMessage(
      {
        type: 'control',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        action: 'vibrate',
        payload: { pattern: [100] },
        ...envelope(),
      },
      { id: 'socket-audit' } as never
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(routed.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.[0], '[Gateway] Command audit');
  assert.deepEqual(audits[0]?.[1], {
    actor: 'manager',
    role: 'manager',
    scopeGroupId: 'stage-left',
    type: 'control',
    command: 'vibrate',
    target: { mode: 'group', groupId: 'stage-left' },
    correlationId: 'corr-1',
    idempotencyKey: 'idem-1',
    decision: 'accept',
  });
});

test('handleMessage audits accepted semantic manager commands', () => {
  const { gateway, routed } = createGateway();
  const audits: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    audits.push(args);
  };
  try {
    gateway.handleMessage(
      {
        type: 'semantic',
        version: 1,
        target: { mode: 'server' },
        actor: 'manager',
        role: 'manager',
        command: {
          kind: 'node.add',
          node: {
            id: 'set-flag',
            type: 'set-boolean-variable',
            position: { x: 0, y: 0 },
            config: { name: 'flag' },
            inputValues: {},
            outputValues: {},
          },
        },
        requestId: 'semantic-add-set-flag',
      },
      { id: 'socket-semantic-audit' } as never
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(routed.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.[0], '[Gateway] Command audit');
  assert.deepEqual(audits[0]?.[1], {
    actor: 'manager',
    role: 'manager',
    scopeGroupId: undefined,
    type: 'semantic',
    command: 'node.add',
    target: { mode: 'server' },
    correlationId: undefined,
    idempotencyKey: undefined,
    decision: 'accept',
  });
});

test('handleMessage rejects partition deploy when target capabilities are missing', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        pluginId: 'node-executor',
        command: 'deploy',
        payload: {
          kind: 'partition-lifecycle',
          operation: 'deploy',
          partition: {
            id: 'partition:display',
            nodeIds: ['visual-1'],
            targetPlatform: 'display',
            requiredCapabilities: ['display.render'],
            boundRevision: 1,
          },
          availableCapabilities: [],
          currentRevision: 1,
        },
        ...envelope(),
      },
      { id: 'socket-partition-capability' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'partition.capability.missing');
  assert.equal(loggedMetadata(warnings).path, 'payload.partition.requiredCapabilities');
});

test('handleMessage rejects client direct partition lifecycle control outside ControlPlane transfer', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        pluginId: 'node-executor',
        command: 'start',
        payload: {
          kind: 'partition-lifecycle',
          operation: 'start',
          partitionId: 'partition:client',
        },
        actor: 'client-1',
        role: 'client',
        scopeGroupId: 'stage-left',
        correlationId: 'corr-client-direct',
        idempotencyKey: 'idem-client-direct',
      },
      { id: 'socket-client-direct' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'server.policy.manager_required');
  assert.equal(loggedMetadata(warnings).path, 'role');
});

test('handleMessage rejects partition lifecycle revision mismatch before routing', () => {
  const { gateway, routed } = createGateway();
  const warnings = captureWarns(() => {
    gateway.handleMessage(
      {
        type: 'plugin',
        version: 1,
        from: 'manager',
        target: { mode: 'group', groupId: 'stage-left' },
        pluginId: 'node-executor',
        command: 'start',
        payload: {
          kind: 'partition-lifecycle',
          operation: 'start',
          partition: {
            id: 'partition:client',
            nodeIds: ['n1'],
            targetPlatform: 'client',
            status: 'deployed',
            boundRevision: 4,
          },
          currentRevision: 5,
        },
        ...envelope(),
      },
      { id: 'socket-partition-revision' } as never
    );
  });

  assert.equal(routed.length, 0);
  assert.equal(loggedMetadata(warnings).code, 'partition.revision_mismatch');
  assert.equal(loggedMetadata(warnings).path, 'payload.partition.boundRevision');
});
