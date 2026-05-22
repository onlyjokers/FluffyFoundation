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

test('resolveLocalServerUrl rewrites saved HTTPS localhost URL to HTTP in dev', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5173',
    origin: 'https://localhost:5173',
    savedUrl: 'https://localhost:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'http://localhost:3001');
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

test('resolveLocalServerUrl upgrades HTTP LAN query URL when current page is HTTPS', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: '10.30.229.86',
    port: '5174',
    origin: 'https://10.30.229.86:5174',
    queryUrl: 'http://10.30.229.86:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'https://10.30.229.86:3001');
});

test('resolveLocalServerUrl preserves HTTP localhost query URL in dev', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5174',
    origin: 'https://localhost:5174',
    queryUrl: 'http://localhost:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'http://localhost:3001');
});

test('resolveLocalServerUrl defaults localhost dev pages to HTTP when insecure control is allowed', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: 'localhost',
    port: '5173',
    origin: 'https://localhost:5173',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'http://localhost:3001');
});

test('resolveLocalServerUrl keeps LAN HTTPS pages on HTTPS in dev', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: '10.30.229.86',
    port: '5174',
    origin: 'https://10.30.229.86:5174',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'https://10.30.229.86:3001');
});

test('resolveLocalServerUrl ignores saved HTTP LAN URL when current page is HTTPS', () => {
  const resolved = resolveLocalServerUrl({
    currentProtocol: 'https:',
    hostname: '10.30.229.86',
    port: '5174',
    origin: 'https://10.30.229.86:5174',
    savedUrl: 'http://10.30.229.86:3001',
    allowInsecureHttp: true,
  });

  assert.equal(resolved, 'https://10.30.229.86:3001');
});
