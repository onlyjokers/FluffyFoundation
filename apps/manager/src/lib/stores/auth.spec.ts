/**
 * Purpose: FF-04 frontend auth source checks for production-safe manager login gating.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const authSource = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8');

test('manager auth source does not compile the legacy hardcoded password', () => {
  assert.equal(authSource.includes('521184'), false);
});

test('manager auth source delegates password checks to the server session endpoint', () => {
  assert.equal(authSource.includes('api/manager/auth/login'), true);
  assert.match(authSource, /credentials: 'include'/);
  assert.equal(authSource.includes('VITE_SHUGU_MANAGER_DEV_PASSWORD'), false);
});

test('manager auth source keeps long-lived sessions fresh while the Manager stays open', () => {
  assert.match(authSource, /setInterval/);
  assert.match(authSource, /api\/manager\/auth\/session/);
});
