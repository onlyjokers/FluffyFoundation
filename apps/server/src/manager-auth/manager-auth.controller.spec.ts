/**
 * Purpose: Verify Manager auth HTTP endpoints set and clear long-lived session cookies.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';

import { ManagerAuthController } from './manager-auth.controller.js';
import { ManagerAuthService } from './manager-auth.service.js';

function createResponseRecorder() {
  const headers = new Map<string, string>();
  return {
    res: {
      setHeader: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      },
    },
    headers,
  };
}

test('ManagerAuthController login sets a manager session cookie', () => {
  const auth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => 1_000,
  });
  const controller = new ManagerAuthController(auth);
  const { res, headers } = createResponseRecorder();

  const body = controller.login({ username: 'Eureka', password: 'secret-password' }, res as never);

  assert.deepEqual(body, { user: 'Eureka' });
  assert.match(headers.get('set-cookie') ?? '', /^shugu_manager_session=/);
});

test('ManagerAuthController rejects invalid login and clears session on logout', () => {
  const auth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => 1_000,
  });
  const controller = new ManagerAuthController(auth);
  const { res, headers } = createResponseRecorder();

  assert.throws(
    () => controller.login({ username: 'Eureka', password: 'wrong' }, res as never),
    UnauthorizedException
  );

  assert.deepEqual(controller.logout(res as never), { ok: true });
  assert.match(headers.get('set-cookie') ?? '', /Max-Age=0/);
});
