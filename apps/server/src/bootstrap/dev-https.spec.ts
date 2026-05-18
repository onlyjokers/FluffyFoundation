/**
 * Purpose: Regression tests for local dev HTTPS opt-in.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldEnableDevHttps, shouldUseHttps } from './dev-https.js';

test('shouldEnableDevHttps defaults to HTTP unless explicitly enabled', () => {
  assert.equal(shouldEnableDevHttps(undefined), false);
  assert.equal(shouldEnableDevHttps(''), false);
  assert.equal(shouldEnableDevHttps('0'), false);
});

test('shouldEnableDevHttps accepts common explicit truthy flags', () => {
  assert.equal(shouldEnableDevHttps('1'), true);
  assert.equal(shouldEnableDevHttps('true'), true);
  assert.equal(shouldEnableDevHttps('YES'), true);
  assert.equal(shouldEnableDevHttps(' on '), true);
});

test('shouldUseHttps preserves production certificate auto-enable behavior', () => {
  assert.equal(shouldUseHttps({ nodeEnv: 'production', devHttps: undefined }), true);
  assert.equal(shouldUseHttps({ nodeEnv: 'development', devHttps: undefined }), false);
  assert.equal(shouldUseHttps({ nodeEnv: undefined, devHttps: '1' }), true);
});
