/**
 * Purpose: Browser-independent FF-15 Display transport state reducer used by the Display app and tests.
 */
import {
  createDisplayAck,
  createDisplayNack,
  type ControlAction,
  type ControlPayload,
  type DisplayDescriptor,
  type DisplayLocalMediaLimits,
  type DisplayOperationResult,
} from '@shugu/protocol';

export type DisplayVisibleOutput = { kind: 'screenColor'; color: string } | { kind: 'image'; url: string } | null;

export type DisplayCapabilityReport = {
  capabilities: string[];
  localMediaLimits: DisplayLocalMediaLimits;
};

export function getDefaultDisplayCapabilities(): DisplayCapabilityReport {
  return {
    capabilities: ['display.render', 'media.image', 'media.video'],
    localMediaLimits: {
      maxBytes: 200 * 1024 * 1024,
      acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'],
    },
  };
}

export function reduceDisplayOutput(
  current: DisplayVisibleOutput,
  action: ControlAction,
  payload: ControlPayload
): DisplayVisibleOutput {
  if (action === 'screenColor') {
    const color = String((payload as { color?: unknown }).color ?? '#000000');
    return { kind: 'screenColor', color };
  }
  if (action === 'showImage') {
    const url = String((payload as { url?: unknown }).url ?? '');
    return url ? { kind: 'image', url } : current;
  }
  if (action === 'hideImage') return null;
  return current;
}

export function createDisplayTransportController(input: {
  displayId: string;
  name?: string;
  groupId?: string;
  capabilities?: string[];
  localMediaLimits?: DisplayLocalMediaLimits;
}) {
  const defaults = getDefaultDisplayCapabilities();
  let descriptor: DisplayDescriptor = {
    displayId: input.displayId,
    ...(input.name ? { name: input.name } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    status: 'discovered',
    capabilities: input.capabilities ?? defaults.capabilities,
    localMediaLimits: input.localMediaLimits ?? defaults.localMediaLimits,
    serverDeliverableAssets: [],
  };
  let output: DisplayVisibleOutput = null;

  return {
    getDescriptor: (): DisplayDescriptor => ({ ...descriptor, capabilities: [...descriptor.capabilities] }),
    getOutput: (): DisplayVisibleOutput => (output && output.kind === 'image' ? { ...output } : output ? { ...output } : null),
    pairLocal: (): DisplayOperationResult => {
      descriptor = { ...descriptor, status: 'paired' };
      return createDisplayAck({ operationId: 'display-pair' }, descriptor.displayId);
    },
    failLocal: (code: 'transport.local_port_closed' | 'transport.unreachable'): DisplayOperationResult => {
      descriptor = { ...descriptor, status: 'fallback' };
      return createDisplayNack({ operationId: 'display-local' }, descriptor.displayId, code);
    },
    applyOperation: (operation: {
      operationId: string;
      action: ControlAction;
      payload: ControlPayload;
      via: 'local' | 'server';
    }): DisplayOperationResult => {
      if (descriptor.status === 'failed') {
        return createDisplayNack(operation, descriptor.displayId, 'display.failed');
      }
      output = reduceDisplayOutput(output, operation.action, operation.payload);
      descriptor = { ...descriptor, status: 'reachable' };
      return createDisplayAck(operation, descriptor.displayId);
    },
  };
}
