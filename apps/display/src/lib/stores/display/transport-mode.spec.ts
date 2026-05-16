/**
 * Purpose: Regression tests for Display local/server transport mode policy.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  shouldApplyDisplayServerMessages,
  shouldConnectDisplayServerPresence,
} from './transport-mode.js';

test('Display connects server presence while waiting for local pairing', () => {
  assert.equal(shouldConnectDisplayServerPresence('pending'), true);
});

test('Display keeps server presence while paired locally', () => {
  assert.equal(shouldConnectDisplayServerPresence('local'), true);
});

test('Display connects server presence in server fallback mode', () => {
  assert.equal(shouldConnectDisplayServerPresence('server'), true);
});

test('Display applies targeted server messages while paired locally', () => {
  assert.equal(shouldApplyDisplayServerMessages('local'), true);
});

test('Display applies targeted server messages in server fallback mode', () => {
  assert.equal(shouldApplyDisplayServerMessages('server'), true);
});

test('Display ignores server messages before a route decision exists', () => {
  assert.equal(shouldApplyDisplayServerMessages('uninitialized'), false);
  assert.equal(shouldApplyDisplayServerMessages('pending'), false);
});
