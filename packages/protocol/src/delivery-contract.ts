/**
 * Purpose: Shared FF-07 delivery classes, backpressure policy, and observable delivery metrics.
 */
import type { ControlAction, MessageWithoutServerTimestamp, SensorType } from './types.js';

export type DeliveryClass =
  | 'volatile-telemetry'
  | 'latest-state-control'
  | 'reliable-command'
  | 'scheduled-command';

export type DeliveryMetricName = 'dropped' | 'coalesced' | 'delivered' | 'late' | 'rejected';

export type DeliveryMetrics = Record<DeliveryMetricName, number>;

export type DeliveryContract = {
  deliveryClass: DeliveryClass;
  canDrop: boolean;
  coalesce: boolean;
  latestStateKey?: string;
};

const VOLATILE_SENSOR_TYPES = new Set<SensorType>(['gyro', 'accel', 'orientation', 'mic']);

const LATEST_STATE_ACTIONS = new Set<ControlAction>([
  'modulateSoundUpdate',
  'screenColor',
  'flashlight',
  'vibrate',
  'setDataReportingRate',
  'setSensorState',
  'showText',
  'hideText',
]);

export function createDeliveryMetrics(): DeliveryMetrics {
  return {
    dropped: 0,
    coalesced: 0,
    delivered: 0,
    late: 0,
    rejected: 0,
  };
}

export function classifyDelivery(message: MessageWithoutServerTimestamp): DeliveryContract {
  if (hasExecuteAt(message)) {
    return {
      deliveryClass: 'scheduled-command',
      canDrop: false,
      coalesce: false,
    };
  }

  if (message.type === 'data' && VOLATILE_SENSOR_TYPES.has(message.sensorType)) {
    return {
      deliveryClass: 'volatile-telemetry',
      canDrop: true,
      coalesce: false,
    };
  }

  if (message.type === 'control' && LATEST_STATE_ACTIONS.has(message.action)) {
    return {
      deliveryClass: 'latest-state-control',
      canDrop: false,
      coalesce: true,
      latestStateKey: `${targetKey(message.target)}:${message.action}`,
    };
  }

  return {
    deliveryClass: 'reliable-command',
    canDrop: false,
    coalesce: false,
  };
}

function hasExecuteAt(message: MessageWithoutServerTimestamp): boolean {
  return 'executeAt' in message && typeof message.executeAt === 'number' && Number.isFinite(message.executeAt);
}

function targetKey(target: { mode: 'all' } | { mode: 'clientIds'; ids: string[] } | { mode: 'group'; groupId: string }): string {
  if (target.mode === 'all') return 'all';
  if (target.mode === 'group') return `group:${target.groupId}`;
  return `clientIds:${target.ids.map(String).filter(Boolean).sort().join(',')}`;
}
