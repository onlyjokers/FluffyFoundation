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

test('handleMessage rejects schema-invalid messages before routing and logs structured reasons', () => {
  const { gateway, routed } = createGateway({ isManager: true });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    gateway.handleMessage(
      { type: 'control', version: 1, from: 'manager', target: { mode: 'all' }, action: 'vibrate' },
      { id: 'socket-1' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.[0], '[Gateway] Message rejected');
  assert.deepEqual(warnings[0]?.[1], {
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
      },
      { id: 'socket-2' } as never
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(routed.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.[0], '[Gateway] Message rejected');
  assert.deepEqual(warnings[0]?.[1], {
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
