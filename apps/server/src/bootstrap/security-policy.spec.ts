/**
 * Purpose: FF-04 tests for production boot, CORS, and manager-control security policy.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createHttpCorsOptions,
  createSocketCorsOptions,
  resolveManagerRole,
  validateServerSecurityConfig,
} from './security-policy.js';

test('validateServerSecurityConfig rejects production without any manager credential path', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: '',
        managerPassword: '',
        allowInsecureManager: '',
        corsOrigins: 'https://manager.example.test',
        hasHttps: true,
      }),
    /SHUGU_MANAGER_PASSWORD/
  );
});

test('validateServerSecurityConfig accepts production manager session auth without legacy manager key', () => {
  assert.doesNotThrow(() =>
    validateServerSecurityConfig({
      nodeEnv: 'production',
      managerKey: '',
      managerPassword: 'shared-manager-password',
      allowInsecureManager: '',
      corsOrigins: 'https://manager.example.test',
      hasHttps: true,
    })
  );
});

test('validateServerSecurityConfig rejects explicit local insecure manager mode in production', () => {
  assert.throws(
    () =>
      validateServerSecurityConfig({
        nodeEnv: 'production',
        managerKey: 'secure-manager-key-123',
        managerPassword: '',
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
        managerPassword: '',
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
        managerPassword: '',
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
    managerPassword: '',
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

test('Socket.IO CORS reflects local development origins so cookies can be sent', () => {
  assert.equal(
    createSocketCorsOptions({
      nodeEnv: undefined,
      managerKey: undefined,
      allowInsecureManager: undefined,
      corsOrigins: undefined,
      hasHttps: true,
    }).origin,
    true
  );
});

test('resolveManagerRole grants local dev manager when no manager key is configured', () => {
  assert.equal(
    resolveManagerRole({
      requestedRole: 'manager',
      expectedManagerKey: '',
      requestedManagerKey: '',
      nodeEnv: 'development',
      address: '127.0.0.1',
    }),
    'manager'
  );
});

test('resolveManagerRole grants LAN dev manager when no manager key is configured', () => {
  assert.equal(
    resolveManagerRole({
      requestedRole: 'manager',
      expectedManagerKey: '',
      requestedManagerKey: '',
      nodeEnv: 'development',
      address: '10.88.0.3',
    }),
    'manager'
  );
});
