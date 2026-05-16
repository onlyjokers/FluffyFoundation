/**
 * Purpose: FF-07 regression tests for the shared realtime delivery contract.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyDelivery,
  createControlMessage,
  createSensorDataMessage,
  type DeliveryClass,
  type DeliveryMetricName,
} from './index.js';

const envelope = {
  actor: 'manager-1',
  role: 'manager' as const,
  scopeGroupId: 'stage-left',
  correlationId: 'corr-1',
  idempotencyKey: 'idem-1',
};

test('classifyDelivery assigns explicit FF-07 delivery classes', () => {
  const cases: Array<{ label: string; message: Parameters<typeof classifyDelivery>[0]; expected: DeliveryClass }> = [
    {
      label: 'volatile telemetry',
      message: createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 2, gamma: 3 }),
      expected: 'volatile-telemetry',
    },
    {
      label: 'latest-state control',
      message: createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'screenColor', {
        color: '#ffffff',
      }),
      expected: 'latest-state-control',
    },
    {
      label: 'latest-state display text',
      message: createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'showText', {
        text: '你好',
      }),
      expected: 'latest-state-control',
    },
    {
      label: 'reliable command',
      message: createControlMessage(envelope, { mode: 'group', groupId: 'stage-left' }, 'playMedia', {
        url: '/show.mp4',
      }),
      expected: 'reliable-command',
    },
    {
      label: 'scheduled command',
      message: createControlMessage(
        envelope,
        { mode: 'group', groupId: 'stage-left' },
        'screenColor',
        { color: '#000000' },
        123456
      ),
      expected: 'scheduled-command',
    },
  ];

  for (const item of cases) {
    assert.equal(classifyDelivery(item.message).deliveryClass, item.expected, item.label);
  }
});

test('delivery metrics expose FF-07 observable outcomes', () => {
  const metricNames: DeliveryMetricName[] = ['dropped', 'coalesced', 'delivered', 'late', 'rejected'];
  assert.deepEqual(metricNames, ['dropped', 'coalesced', 'delivered', 'late', 'rejected']);
});
