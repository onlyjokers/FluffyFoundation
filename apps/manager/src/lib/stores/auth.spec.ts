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

test('manager auth source gates password login to explicit Vite dev configuration', () => {
  assert.match(authSource, /import\.meta\.env\.DEV/);
  assert.match(authSource, /VITE_SHUGU_MANAGER_DEV_PASSWORD/);
});
