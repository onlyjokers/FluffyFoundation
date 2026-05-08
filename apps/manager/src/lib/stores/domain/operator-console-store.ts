/**
 * Purpose: Derive the FF-20 operator-console snapshot from live Manager runtime stores.
 */
import { derived } from 'svelte/store';

import {
  buildOperatorConsoleSnapshot,
  buildOperatorConsoleSnapshotInput,
  type OperatorExecutorStatus,
} from './operator-console';
import { clientReadiness, sensorData, state } from '../manager';
import type { SensorDataMessage } from '@shugu/protocol';

const EXECUTOR_LOG_LIMIT = 30;

function executorStatusFromSensorData(sensorMessages: Map<string, SensorDataMessage>): Map<string, OperatorExecutorStatus> {
  const next = new Map<string, OperatorExecutorStatus>();
  for (const [clientId, message] of sensorMessages.entries()) {
    if (message.sensorType !== 'custom' || !message.payload || typeof message.payload !== 'object') continue;
    const payload = message.payload as Record<string, unknown>;
    if (payload.kind !== 'node-executor') continue;
    const event = typeof payload.event === 'string' ? payload.event : 'unknown';
    const loopId = typeof payload.loopId === 'string' ? payload.loopId : null;
    const error = payload.error ? String(payload.error) : null;
    const at =
      typeof message.serverTimestamp === 'number' && Number.isFinite(message.serverTimestamp)
        ? message.serverTimestamp
        : (message.clientTimestamp ?? Date.now());

    next.set(clientId, {
      running: event === 'deployed' || event === 'started',
      loopId,
      lastEvent: event,
      lastError: error,
      lastSeenAt: at,
      log: [
        {
          at,
          event,
          loopId,
          error,
          payload,
        },
      ].slice(-EXECUTOR_LOG_LIMIT),
    });
  }
  return next;
}

export const operatorConsoleSnapshot = derived(
  [state, clientReadiness, sensorData],
  ([$state, $clientReadiness, $sensorData]) =>
    buildOperatorConsoleSnapshot(
      buildOperatorConsoleSnapshotInput({
        managerState: $state,
        clientReadiness: $clientReadiness,
        executorStatusByClient: executorStatusFromSensorData($sensorData),
        pendingTransfers: [],
        killSwitch: { active: false, updatedAt: Date.now() },
        now: Date.now(),
      })
    )
);
