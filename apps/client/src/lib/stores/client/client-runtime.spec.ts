/**
 * Purpose: Regression tests for client runtime capability gates used by NodeExecutor.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canRunClientRuntimeCapability } from './client-runtime-capabilities.js';

test('client runtime denies flashlight when camera permission is not granted', () => {
  assert.equal(
    canRunClientRuntimeCapability('flashlight', {
      permissions: {
        microphone: 'denied',
        motion: 'granted',
        camera: 'denied',
        wakeLock: 'denied',
        geolocation: 'granted',
      },
      e2eFlashlightProof: false,
    }),
    false
  );
});

test('client runtime allows flashlight in explicit e2e proof mode without changing production gate', () => {
  assert.equal(
    canRunClientRuntimeCapability('flashlight', {
      permissions: {
        microphone: 'denied',
        motion: 'granted',
        camera: 'denied',
        wakeLock: 'denied',
        geolocation: 'granted',
      },
      e2eFlashlightProof: true,
    }),
    true
  );
});
