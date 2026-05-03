/**
 * Purpose: Server-side FF-15 Display fallback routing helpers.
 */
import {
  createDisplayAck,
  createDisplayNack,
  createControlMessage,
  createPolicyRejectReason,
  resolveDisplayRoutes,
  type ControlMessage,
  type DisplayDescriptor,
  type DisplayNackReasonCode,
  type DisplayOperation,
  type DisplayOperationResult,
  type DisplayRouteTarget,
  type MessageWithoutServerTimestamp,
  type ValidationRejectReason,
} from '@shugu/protocol';

const DISPLAY_SERVER_ACTOR = {
  actorId: 'display-router',
  actorRole: 'manager' as const,
  scopeGroupId: '__system__',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDisplayRouteTarget(value: unknown): value is DisplayRouteTarget {
  if (!isRecord(value) || typeof value.mode !== 'string') return false;

  switch (value.mode) {
    case 'displayId':
      return typeof value.displayId === 'string';
    case 'displayName':
      return typeof value.name === 'string';
    case 'displayGroup':
      return typeof value.groupId === 'string';
    case 'capability':
      return typeof value.capability === 'string';
    case 'localMedia':
      return typeof value.mimeType === 'string' && typeof value.sizeBytes === 'number';
    case 'serverAsset':
      return typeof value.assetRef === 'string';
    default:
      return false;
  }
}

function isDisplayOperation(value: unknown): value is DisplayOperation {
  return (
    isRecord(value) &&
    value.kind === 'display-operation' &&
    typeof value.operationId === 'string' &&
    isDisplayRouteTarget(value.target) &&
    typeof value.action === 'string'
  );
}

function noRouteReasonForTarget(target: DisplayRouteTarget): DisplayNackReasonCode {
  switch (target.mode) {
    case 'capability':
      return 'capability.unsupported';
    case 'localMedia':
      return 'media.local_limit_exceeded';
    case 'serverAsset':
      return 'asset.not_server_deliverable';
    default:
      return 'route.no_match';
  }
}

export function createServerDisplayRoutingResults(
  displays: DisplayDescriptor[],
  operation: unknown
): DisplayOperationResult[] {
  if (!isDisplayOperation(operation)) {
    const operationId =
      isRecord(operation) && typeof operation.operationId === 'string' ? operation.operationId : 'display-operation.invalid';
    return [createDisplayNack({ operationId }, '*', 'operation.invalid')];
  }

  const matches = resolveDisplayRoutes(displays, operation.target);
  if (matches.length === 0) {
    return [createDisplayNack(operation, '*', noRouteReasonForTarget(operation.target))];
  }

  return matches.map((display) =>
    display.status === 'failed'
      ? createDisplayNack(operation, display.displayId, 'display.failed')
      : createDisplayAck(operation, display.displayId)
  );
}

export function createServerDisplayFallbackMessages(
  displays: DisplayDescriptor[],
  operation: DisplayOperation
): Array<Omit<ControlMessage, 'serverTimestamp'>> {
  return resolveDisplayRoutes(displays, operation.target).flatMap((display) => {
    if (display.status === 'failed') return [];

    const payload =
      operation.payload && typeof operation.payload === 'object'
        ? { ...(operation.payload as Record<string, unknown>), displayOperationId: operation.operationId }
        : ({ value: operation.payload, displayOperationId: operation.operationId } as Record<string, unknown>);

    return [
      createControlMessage(
        DISPLAY_SERVER_ACTOR,
        { mode: 'clientIds', ids: [display.displayId] },
        operation.action,
        payload
      ) as Omit<ControlMessage, 'serverTimestamp'>,
    ];
  });
}

export function handleDisplayRouterCommand(input: {
  message: MessageWithoutServerTimestamp;
  isManager: boolean;
  displays: DisplayDescriptor[];
  routeMessage: (message: Omit<ControlMessage, 'serverTimestamp'>) => void;
  logRejected: (reasons: ValidationRejectReason[]) => void;
  audit: () => void;
}): boolean {
  const message = input.message;
  if (message.type !== 'plugin') return false;
  const pluginMessage = message as { pluginId?: unknown; command?: unknown; payload?: unknown };
  if (pluginMessage.pluginId !== 'display-router' || pluginMessage.command !== 'display-operation') return false;

  if (!input.isManager) {
    input.logRejected([
      createPolicyRejectReason({
        actor: 'from' in message ? message.from : 'unknown',
        scope: 'server.display-routing.authorization',
        type: message.type,
        path: 'pluginId',
        message: 'manager role is required for Display routing',
      }),
    ]);
    return true;
  }

  const operation = pluginMessage.payload as Partial<DisplayOperation> | null;
  if (!operation || operation.kind !== 'display-operation') {
    input.logRejected([
      createPolicyRejectReason({
        actor: 'from' in message ? message.from : 'unknown',
        scope: 'server.display-routing.payload',
        type: message.type,
        path: 'payload.kind',
        message: 'Display router payload must be a display-operation',
      }),
    ]);
    return true;
  }

  for (const routed of createServerDisplayFallbackMessages(input.displays, operation as DisplayOperation)) {
    input.routeMessage(routed);
  }
  input.audit();
  return true;
}
