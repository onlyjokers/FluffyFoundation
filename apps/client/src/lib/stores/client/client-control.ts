/**
 * Client-side control executor for Manager->Client Control and PluginControl messages.
 *
 * This module is deliberately "runtime-agnostic": it receives SDK/controllers via getters so
 * the store entrypoint can own lifecycle concerns (init/disconnect).
 */

import type {
  ControlAction,
  ControlBatchPayload,
  ControlMessage,
  ControlPayload,
  PluginControlMessage,
} from '@shugu/protocol';
import { executeCustomControl } from './client-control/custom-control-handler';
import { executeClientUiControl } from './client-control/client-ui-control-handler';
import { executeDeviceControl } from './client-control/device-control-handler';
import { recordE2ECommand } from './client-control/e2e-recorder';
import { executeMediaControl } from './client-control/media-control-handler';
import { handlePluginControlMessage as executePluginControlMessage } from './client-control/plugin-control-handler';
import { executeTextControl } from './client-control/text-control-handler';
import { executeVisualControl } from './client-control/visual-control-handler';
import type { ClientControlDeps } from './client-control/types';
import { asRecord } from './client-control/types';

export type { ClientControlDeps } from './client-control/types';

function isControlBatchPayload(payload: ControlPayload): payload is ControlBatchPayload {
  const record = asRecord(payload);
  if (!record) return false;
  if (record.kind !== 'control-batch') return false;
  return Array.isArray(record.items);
}

export function createClientControlHandlers(deps: ClientControlDeps): {
  handleControlMessage: (message: ControlMessage) => void;
  handlePluginControlMessage: (message: PluginControlMessage) => void;
  executeControl: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void;
} {
  function executeControl(action: ControlAction, payload: ControlPayload, executeAt?: number): void {
    // Expand control batches early so we don't schedule the wrapper message (avoid double scheduling).
    if (action === 'custom' && isControlBatchPayload(payload)) {
      const batch = payload as ControlBatchPayload;
      const batchExecuteAt =
        typeof batch.executeAt === 'number' && Number.isFinite(batch.executeAt)
          ? batch.executeAt
          : executeAt;

      for (const raw of batch.items) {
        const itemRecord = asRecord(raw);
        if (!itemRecord) continue;
        const actionRaw = itemRecord.action;
        if (typeof actionRaw !== 'string') continue;
        const itemAction = actionRaw as ControlAction;
        const itemPayload = (asRecord(itemRecord.payload) ?? {}) as ControlPayload;
        const itemExecuteAtRaw = itemRecord.executeAt;
        const itemExecuteAt =
          typeof itemExecuteAtRaw === 'number' && Number.isFinite(itemExecuteAtRaw)
            ? itemExecuteAtRaw
            : batchExecuteAt;
        executeControl(itemAction, itemPayload, itemExecuteAt);
      }
      return;
    }

    const executeAction = (delaySeconds = 0) => {
      recordE2ECommand(action, payload, executeAt);

      if (executeDeviceControl(deps, action, payload, delaySeconds)) return;
      if (executeMediaControl(deps, action, payload, delaySeconds)) return;
      if (deps.textOverlay && executeTextControl({ textOverlay: deps.textOverlay }, action, payload)) return;
      if (executeVisualControl(action, payload)) return;
      if (executeClientUiControl(action, payload)) return;
      if (action === 'shutdown') {
        deps.stopAllCleanup?.();
        return;
      }
      if (executeCustomControl(deps, action, payload)) return;

      console.log('[Client] Unknown action:', action);
    };

    const sdkNow = deps.getSDK();
    if (executeAt && sdkNow) {
      // Special efficient path for audio: use Web Audio scheduling
        const shouldUseAudioScheduling =
          action === 'modulateSound' ||
          action === 'playSound' ||
          (action === 'playMedia' &&
            (() => {
              const payloadRecord = asRecord(payload);
              const mediaType = typeof payloadRecord?.mediaType === 'string' ? payloadRecord.mediaType : null;
              if (mediaType === 'video') return false;
              const rawUrl = payloadRecord?.url;
              const url = typeof rawUrl === 'string' ? rawUrl : String(rawUrl ?? '');
              return !/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(url);
            })());

      if (shouldUseAudioScheduling) {
        const delayMs = sdkNow.getDelayUntil(executeAt);
        const delaySeconds = Math.max(0, delayMs / 1000);

        // Execute immediately but pass the Future Delay to the audio engine
        // This bypasses setTimeout jitter
        executeAction(delaySeconds);
      } else {
        // Standard scheduling for visual effects (setTimeout is fine)
        const { cancel, delay } = sdkNow.scheduleAt(executeAt, () => executeAction(0));
        if (delay < 0) {
          // Already past: execute immediately and cancel the scheduled callback to avoid double execution.
          cancel();
          executeAction(0);
        }
      }
    } else {
      executeAction(0);
    }
  }

  function handleControlMessage(message: ControlMessage): void {
    // Calculate and log message size
    try {
      const messageJson = JSON.stringify(message);
      const messageSizeBytes = new Blob([messageJson]).size;
      const messageSizeKB = (messageSizeBytes / 1024).toFixed(2);

      console.log(
        `[Message] Received ${message.action} | Size: ${messageSizeBytes} bytes (${messageSizeKB} KB)`
      );
    } catch (err) {
      console.warn('[Message] Failed to calculate message size:', err);
    }

    executeControl(message.action, message.payload, message.executeAt);
  }

  function handlePluginControlMessage(message: PluginControlMessage): void {
    executePluginControlMessage(deps, message);
  }

  return { handleControlMessage, handlePluginControlMessage, executeControl };
}
