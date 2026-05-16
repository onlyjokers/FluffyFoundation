/**
 * Purpose: Regression tests for client page connection lifecycle decisions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getClientConnectionLifecycleAction } from './connection-lifecycle.js';

test('client disconnects when the page is merely hidden', () => {
  assert.equal(
    getClientConnectionLifecycleAction({
      event: 'visibilitychange',
      hasStarted: true,
      visibilityState: 'hidden',
    }),
    'disconnect'
  );
});

test('client reconnects when a started page becomes visible again', () => {
  assert.equal(
    getClientConnectionLifecycleAction({
      event: 'visibilitychange',
      hasStarted: true,
      visibilityState: 'visible',
    }),
    'connect'
  );
});

test('client still disconnects when the page is actually leaving', () => {
  assert.equal(
    getClientConnectionLifecycleAction({
      event: 'pagehide',
      hasStarted: true,
      visibilityState: 'visible',
    }),
    'disconnect'
  );
});
