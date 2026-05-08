/**
 * Purpose: FF-20 tests for operator-console observability reports, metrics, and diagnosis.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildOperatorConsoleSnapshot,
  buildOperatorConsoleSnapshotInput,
  diagnoseFailedDisplayUpdate,
  normalizeObservabilityEvent,
} from './operator-console';

test('operator console snapshot exposes required health, partitions, devices, failures, transfers, and kill switch state', () => {
  const snapshot = buildOperatorConsoleSnapshot({
    connectionStatus: 'connected',
    clients: [
      { clientId: 'display-1', group: 'display', connected: true, connectedAt: 1000 },
      { clientId: 'client-1', group: 'audience', connected: true, connectedAt: 1100 },
      { clientId: 'client-2', group: 'audience', connected: false, connectedAt: 1200 },
    ],
    clientReadiness: new Map([
      ['display-1', { status: 'assets-ready', updatedAt: 1300, manifestId: 'display-assets' }],
      ['client-1', { status: 'assets-error', updatedAt: 1400, manifestId: 'show-assets', error: 'missing video' }],
    ]),
    executorStatusByClient: new Map([
      [
        'client-1',
        {
          running: false,
          loopId: 'loop:display',
          lastEvent: 'rejected',
          lastError: 'capability missing: screenColor',
          lastSeenAt: 1500,
          log: [
            {
              at: 1500,
              event: 'rejected',
              loopId: 'loop:display',
              error: 'capability missing: screenColor',
              payload: { code: 'partition.capability.missing' },
            },
          ],
        },
      ],
    ]),
    activePartitionIds: ['partition:display'],
    pendingTransfers: [{ transferId: 'transfer-1', groupId: 'audience', targetClientId: 'client-1', status: 'pending' }],
    killSwitch: { active: false, updatedAt: 1600 },
    metrics: {
      latencyMs: [21, 63],
      traffic: { inbound: 12, outbound: 9 },
      errors: 1,
      saturation: 0.75,
      drops: 2,
      fps: 58,
      audioReady: { ready: 1, total: 2 },
      deviceCapability: { ready: 1, total: 2 },
      commandOutcomes: { ok: 3, failed: 1 },
    },
    now: 1700,
  });

  assert.equal(snapshot.health.status, 'degraded');
  assert.deepEqual(snapshot.activePartitions, ['partition:display']);
  assert.equal(snapshot.connectedDevices.total, 3);
  assert.equal(snapshot.connectedDevices.online, 2);
  assert.equal(snapshot.connectedDevices.displayOnline, 1);
  assert.equal(snapshot.failedCommands.length, 1);
  assert.equal(snapshot.failedCommands[0].category, 'node-executor-status');
  assert.equal(snapshot.pendingTransfers.length, 1);
  assert.equal(snapshot.killSwitch.active, false);
  assert.equal(snapshot.metrics.latency.p95Ms, 63);
  assert.equal(snapshot.metrics.commandOutcomes.failed, 1);
});

test('observability events normalize every FF-20 required report category with metric classes', () => {
  const categories = [
    'validation-error',
    'permission-denial',
    'transport-failure',
    'node-executor-status',
    'display-status',
    'asset-readiness',
    'ai-proposal',
    'rollback',
  ];

  const events = categories.map((category) =>
    normalizeObservabilityEvent({
      category,
      severity: category === 'display-status' ? 'info' : 'warning',
      message: `${category} event`,
      at: 1000,
      source: 'test',
      targetId: 'display-1',
    })
  );

  assert.deepEqual(events.map((event) => event.category), categories);
  assert.deepEqual(
    [...new Set(events.flatMap((event) => event.metricClasses))].sort(),
    [
      'audio-readiness',
      'command-outcome',
      'device-capability',
      'drops',
      'errors',
      'fps',
      'latency',
      'saturation',
      'traffic',
    ].sort()
  );
});

test('failed display update diagnosis is derived from structured reports, not UI-only state', () => {
  const diagnosis = diagnoseFailedDisplayUpdate(
    buildOperatorConsoleSnapshot({
      connectionStatus: 'connected',
      clients: [{ clientId: 'display-1', group: 'display', connected: true, connectedAt: 1000 }],
      clientReadiness: new Map([
        ['display-1', { status: 'assets-ready', updatedAt: 1100, manifestId: 'display-assets' }],
      ]),
      executorStatusByClient: new Map([
        [
          'display-1',
          {
            running: false,
            loopId: 'loop:display',
            lastEvent: 'rejected',
            lastError: 'target group must match scopeGroupId',
            lastSeenAt: 1200,
            log: [
              {
                at: 1200,
                event: 'rejected',
                loopId: 'loop:display',
                error: 'target group must match scopeGroupId',
                payload: {
                  code: 'server.policy.scope_mismatch',
                  target: { mode: 'group', groupId: 'display' },
                },
              },
            ],
          },
        ],
      ]),
      activePartitionIds: [],
      pendingTransfers: [],
      killSwitch: { active: false, updatedAt: 1300 },
      metrics: { commandOutcomes: { ok: 0, failed: 1 } },
      now: 1400,
    })
  );

  assert.equal(diagnosis.status, 'diagnosed');
  assert.equal(diagnosis.displayClientId, 'display-1');
  assert.equal(diagnosis.failure.category, 'permission-denial');
  assert.match(diagnosis.summary, /scopeGroupId/);
  assert.deepEqual(diagnosis.evidence.map((event) => event.category), ['permission-denial', 'node-executor-status']);
});

test('operator console input is derived from manager runtime stores', () => {
  const input = buildOperatorConsoleSnapshotInput({
    managerState: {
      status: 'connected',
      clients: [
        { clientId: 'display-1', group: 'display', connectedAt: 1000 },
        { clientId: 'client-1', group: 'audience', connectedAt: 1100 },
      ],
    },
    clientReadiness: new Map([
      ['display-1', { status: 'assets-ready', manifestId: 'display-assets', updatedAt: 1200 }],
    ]),
    executorStatusByClient: new Map([
      [
        'display-1',
        {
          running: false,
          loopId: 'loop:display',
          lastEvent: 'rejected',
          lastError: 'target group must match scopeGroupId',
          lastSeenAt: 1300,
          log: [
            {
              at: 1300,
              event: 'rejected',
              loopId: 'loop:display',
              error: 'target group must match scopeGroupId',
              payload: { code: 'server.policy.scope_mismatch' },
            },
          ],
        },
      ],
    ]),
    pendingTransfers: [{ transferId: 'transfer-1', groupId: 'audience', targetClientId: 'client-1', status: 'pending' }],
    killSwitch: { active: true, updatedAt: 1400 },
    activePartitionIds: ['partition:display'],
    now: 1500,
  });
  const snapshot = buildOperatorConsoleSnapshot(input);

  assert.equal(snapshot.health.connectionStatus, 'connected');
  assert.equal(snapshot.connectedDevices.displayOnline, 1);
  assert.equal(snapshot.pendingTransfers[0].transferId, 'transfer-1');
  assert.equal(snapshot.killSwitch.active, true);
  assert.equal(snapshot.activePartitions[0], 'partition:display');
  assert.equal(snapshot.failedCommands[0].category, 'permission-denial');
});
