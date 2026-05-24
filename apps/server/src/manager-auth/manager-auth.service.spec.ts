/**
 * Purpose: Verify server-side Manager session credentials and signed cookie behavior.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ManagerAuthService } from './manager-auth.service.js';

test('ManagerAuthService has no constructor dependency metadata for Nest DI', () => {
  assert.deepEqual(Reflect.getMetadata('design:paramtypes', ManagerAuthService) ?? [], []);
});

test('ManagerAuthService creates and verifies a long-lived signed manager session', () => {
  const auth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka,Starno,VKong',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => 1_000,
  });

  const result = auth.login({ username: 'Eureka', password: 'secret-password' });

  assert.equal(result.ok, true);
  assert.equal(result.user, 'Eureka');
  assert.match(result.cookie, /^shugu_manager_session=/);
  assert.match(result.cookie, /HttpOnly/);
  assert.match(result.cookie, /SameSite=Lax/);
  assert.match(result.cookie, /Max-Age=2592000/);

  const verified = auth.verifyCookieHeader(result.cookie);
  assert.deepEqual(verified, { ok: true, user: 'Eureka', shouldRefresh: false });
});

test('ManagerAuthService rejects invalid passwords and tampered cookies', () => {
  const auth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => 1_000,
  });

  assert.deepEqual(auth.login({ username: 'Eureka', password: 'wrong' }), {
    ok: false,
    reason: 'invalid-credentials',
  });

  const result = auth.login({ username: 'Eureka', password: 'secret-password' });
  assert.equal(result.ok, true);
  const cookieValue = /^shugu_manager_session=([^;]+)/.exec(result.cookie)?.[1] ?? '';
  const [payload, signature] = decodeURIComponent(cookieValue).split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ user: 'Starno', exp: 30 * 24 * 60 * 60 * 1000 }),
    'utf8'
  ).toString('base64url');
  const tampered = `shugu_manager_session=${encodeURIComponent(`${tamperedPayload}.${signature ?? ''}`)}`;

  assert.deepEqual(auth.verifyCookieHeader(tampered), {
    ok: false,
    reason: 'invalid-session',
  });
});

test('ManagerAuthService refreshes active sessions near the renewal window and expires old sessions', () => {
  let now = 1_000;
  const auth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => now,
  });

  const result = auth.login({ username: 'Eureka', password: 'secret-password' });
  assert.equal(result.ok, true);

  now += 26 * 24 * 60 * 60 * 1_000;
  const nearExpiry = auth.verifyCookieHeader(result.cookie);
  assert.equal(nearExpiry.ok, true);
  assert.equal(nearExpiry.shouldRefresh, true);
  assert.match(nearExpiry.cookie ?? '', /^shugu_manager_session=/);

  now += 31 * 24 * 60 * 60 * 1_000;
  assert.deepEqual(auth.verifyCookieHeader(result.cookie), {
    ok: false,
    reason: 'expired-session',
  });
});
