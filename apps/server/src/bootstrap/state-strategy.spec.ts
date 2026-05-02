/**
 * Purpose: FF-06 tests for the server state strategy and unsupported multi-instance boot guard.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStateStrategyStatus,
  validateServerStateStrategyConfig,
} from './state-strategy.js';

test('validateServerStateStrategyConfig rejects Redis broadcast under production single-server state', () => {
  assert.throws(
    () =>
      validateServerStateStrategyConfig({
        nodeEnv: 'production',
        redisUrl: 'redis://127.0.0.1:6379',
      }),
    /REDIS_URL/
  );
});

test('validateServerStateStrategyConfig rejects explicit clustered process counts in production', () => {
  assert.throws(
    () =>
      validateServerStateStrategyConfig({
        nodeEnv: 'production',
        webConcurrency: '2',
      }),
    /WEB_CONCURRENCY/
  );

  assert.throws(
    () =>
      validateServerStateStrategyConfig({
        nodeEnv: 'production',
        instances: '2',
      }),
    /INSTANCES/
  );
});

test('createStateStrategyStatus makes the single-server owner and guarded fields visible', () => {
  const status = createStateStrategyStatus({
    nodeEnv: 'production',
    instanceId: 'server-a',
  });

  assert.deepEqual(status, {
    mode: 'single-server',
    instanceId: 'server-a',
    registryOwner: 'server-process',
    selectionOwner: 'server-process',
    ownershipOwner: 'server-process',
    controlPlaneSnapshotOwner: 'server-process',
    unsupportedClusterEnv: ['REDIS_URL', 'SHUGU_STATE_STRATEGY', 'WEB_CONCURRENCY', 'INSTANCES', 'NODE_APP_INSTANCE'],
  });
});
