/**
 * Purpose: Shared FF-15 Display transport, routing, status, capability, and ack/nack contracts.
 */
import type { ControlAction, ControlPayload } from './types.js';

export type DisplayStatusState = 'discovered' | 'paired' | 'reachable' | 'degraded' | 'fallback' | 'failed';

export type DisplayTransportKind = 'local-message-port' | 'server-fallback';

export type DisplayLocalMediaLimits = {
  maxBytes: number;
  acceptedMimeTypes: string[];
};

export type DisplayDescriptor = {
  displayId: string;
  name?: string;
  groupId?: string;
  status: DisplayStatusState;
  capabilities: string[];
  localMediaLimits: DisplayLocalMediaLimits;
  serverDeliverableAssets: string[];
};

export type DisplayRouteTarget =
  | { mode: 'displayId'; displayId: string }
  | { mode: 'displayName'; name: string }
  | { mode: 'displayGroup'; groupId: string }
  | { mode: 'capability'; capability: string }
  | { mode: 'localMedia'; mimeType: string; sizeBytes: number }
  | { mode: 'serverAsset'; assetRef: string };

export type DisplayOperation = {
  kind: 'display-operation';
  operationId: string;
  target: DisplayRouteTarget;
  action: ControlAction;
  payload: ControlPayload;
  transportPreference?: DisplayTransportKind | 'auto';
};

export type DisplayAck = {
  kind: 'display-ack';
  operationId: string;
  displayId: string;
  ok: true;
};

export type DisplayNackReasonCode =
  | 'transport.unreachable'
  | 'transport.local_port_closed'
  | 'route.no_match'
  | 'capability.unsupported'
  | 'media.local_limit_exceeded'
  | 'asset.not_server_deliverable'
  | 'operation.invalid'
  | 'display.failed';

export type DisplayNack = {
  kind: 'display-nack';
  operationId: string;
  displayId: string;
  ok: false;
  reason: {
    code: DisplayNackReasonCode;
    message?: string;
  };
};

export type DisplayOperationResult = DisplayAck | DisplayNack;

export interface DisplayTransport {
  readonly kind: DisplayTransportKind;
  getDescriptor(): DisplayDescriptor;
  send(operation: DisplayOperation): DisplayOperationResult;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function createDisplayOperation(input: {
  operationId: string;
  target: DisplayRouteTarget;
  action: ControlAction;
  payload: ControlPayload;
  transportPreference?: DisplayOperation['transportPreference'];
}): DisplayOperation {
  return {
    kind: 'display-operation',
    operationId: input.operationId,
    target: input.target,
    action: input.action,
    payload: input.payload,
    ...(input.transportPreference ? { transportPreference: input.transportPreference } : {}),
  };
}

export function createDisplayAck(operation: Pick<DisplayOperation, 'operationId'>, displayId: string): DisplayAck {
  return {
    kind: 'display-ack',
    operationId: operation.operationId,
    displayId,
    ok: true,
  };
}

export function createDisplayNack(
  operation: Pick<DisplayOperation, 'operationId'>,
  displayId: string,
  code: DisplayNackReasonCode,
  message?: string
): DisplayNack {
  return {
    kind: 'display-nack',
    operationId: operation.operationId,
    displayId,
    ok: false,
    reason: {
      code,
      ...(message ? { message } : {}),
    },
  };
}

export function canDisplayAcceptLocalMedia(
  display: Pick<DisplayDescriptor, 'localMediaLimits'>,
  input: { mimeType: string; sizeBytes: number }
): boolean {
  const mimeType = normalize(input.mimeType);
  const maxBytes = display.localMediaLimits.maxBytes;
  return (
    input.sizeBytes >= 0 &&
    input.sizeBytes <= maxBytes &&
    display.localMediaLimits.acceptedMimeTypes.map(normalize).includes(mimeType)
  );
}

export function resolveDisplayRoutes(
  displays: DisplayDescriptor[],
  target: DisplayRouteTarget
): DisplayDescriptor[] {
  switch (target.mode) {
    case 'displayId':
      return displays.filter((display) => display.displayId === target.displayId);
    case 'displayName':
      return displays.filter((display) => normalize(display.name ?? '') === normalize(target.name));
    case 'displayGroup':
      return displays.filter((display) => display.groupId === target.groupId);
    case 'capability':
      return displays.filter((display) => display.capabilities.includes(target.capability));
    case 'localMedia':
      return displays.filter((display) => canDisplayAcceptLocalMedia(display, target));
    case 'serverAsset':
      return displays.filter((display) => display.serverDeliverableAssets.includes(target.assetRef));
    default:
      return [];
  }
}
