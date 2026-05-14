/**
 * Purpose: Tests for local manager/client server URL resolution.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLocalServerUrl } from '@shugu/protocol';

test('resolveLocalServerUrl preserves saved HTTP localhost URL in dev', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5174',
    origin: 'https://localhost:5174',
    savedUrl: 'http://localhost:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'http://localhost:3001');
});

test('resolveLocalServerUrl ignores saved HTTP URL outside dev', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5174',
    origin: 'https://localhost:5174',
    savedUrl: 'http://localhost:3001',
    allowInsecureHttp: false,
  });

  assert.equal(resolved, 'https://localhost:3001');
});

test('resolveLocalServerUrl prefers query param over saved URL', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5174',
    origin: 'https://localhost:5174',
    queryUrl: 'http://127.0.0.1:3001',
    savedUrl: 'https://localhost:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'http://127.0.0.1:3001');
});
