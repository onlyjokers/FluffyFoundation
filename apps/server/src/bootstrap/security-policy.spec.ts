/**
 * Purpose: FF-04 tests for production boot, CORS, and manager-control security policy.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createHttpCorsOptions,
  createSocketCorsOptions,
  validateServerSecurityConfig,
} from './security-policy.js';

test('validateServerSecurityConfig rejects production without a secure manager key', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: '',
        allowInsecureManager: '',
        corsOrigins: 'https://manager.example.test',
        hasHttps: true,
      }),
    /SHUGU_MANAGER_KEY/
  );
});

test('validateServerSecurityConfig rejects explicit local insecure manager mode in production', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: 'secure-manager-key-123',
        allowInsecureManager: '1',
        corsOrigins: 'https://manager.example.test',
        hasHttps: true,
      }),
    /SHUGU_ALLOW_INSECURE_MANAGER/
  );
});

test('validateServerSecurityConfig rejects production wildcard CORS origins', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: 'secure-manager-key-123',
        allowInsecureManager: '',
        corsOrigins: '*',
        hasHttps: true,
      }),
    /CORS/
  );
});

test('validateServerSecurityConfig blocks production HTTP fallback for manager control', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: 'secure-manager-key-123',
        allowInsecureManager: '',
        corsOrigins: 'https://manager.example.test',
        hasHttps: false,
      }),
    /HTTPS/
  );
});

test('HTTP and Socket.IO CORS options fail closed in production and preserve explicit origins', () => {
  const options = {
    nodeEnv: 'production',
    managerKey: 'secure-manager-key-123',
    allowInsecureManager: '',
    corsOrigins: 'https://manager.example.test,https://control.example.test',
    hasHttps: true,
  };

  assert.deepEqual(createHttpCorsOptions(options).origin, [
    'https://manager.example.test',
    'https://control.example.test',
  ]);
  assert.deepEqual(createSocketCorsOptions(options).origin, [
    'https://manager.example.test',
    'https://control.example.test',
  ]);
});

test('Socket.IO CORS uses a real wildcard origin for local development defaults', () => {
  assert.equal(
    createSocketCorsOptions({
      nodeEnv: undefined,
      managerKey: undefined,
      allowInsecureManager: undefined,
      corsOrigins: undefined,
      hasHttps: true,
    }).origin,
    '*'
  );
});
