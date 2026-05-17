/**
 * Purpose: Resolve Display node routing controls into concrete remote Display ids.
 */
import { createDisplayOperation, type ControlAction, type ControlPayload } from '@shugu/protocol';

type AnyRecord = Record<string, unknown>;

export type DisplayTargetClient = {
  clientId: string;
  group?: string;
  connected?: boolean;
};

export type DisplayTargetNodeState = {
  config?: AnyRecord;
  inputValues?: AnyRecord;
};

export type DisplayTargetGraphState = {
  connections?: Array<{ targetNodeId?: string; targetPortId?: string }>;
};

export type ResolveDisplayNodeTargetsOptions = {
  nodeId: string;
  clients: DisplayTargetClient[];
  node?: DisplayTargetNodeState | null;
  computedInputs?: AnyRecord | null;
  graph?: DisplayTargetGraphState | null;
};

export type SendDisplayNodeCommandOptions = ResolveDisplayNodeTargetsOptions & {
  action: ControlAction;
  payload: ControlPayload;
  executeAt?: number;
  sendLocalControl: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void;
  sendDisplayOperation?: (operation: ReturnType<typeof createDisplayOperation>) => void;
};

type DisplayRouteState = {
  ids: string[];
  action: ControlAction;
};

const displayRouteStateByNode = new Map<string, DisplayRouteState>();

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : null;

const clampInt = (value: number, min: number, max: number): number => {
  const next = Math.floor(value);
  return Math.max(min, Math.min(max, next));
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
  return fallback;
};

const hashStringDjb2 = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
};

export const buildStableDisplayOrder = (nodeId: string, ids: string[]): string[] => {
  const keyed = ids.map((id) => ({ id, score: hashStringDjb2(`${nodeId}|${id}`) }));
  keyed.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return keyed.map((entry) => entry.id);
};

export function displayClientIdsInOrder(clients: DisplayTargetClient[]): string[] {
  return (clients ?? [])
    .filter((client) => String(client.group ?? '') === 'display' && client.connected !== false)
    .map((client) => String(client.clientId ?? '').trim())
    .filter(Boolean);
}

export function resolveDisplayNodeTargets(
  options: ResolveDisplayNodeTargetsOptions
): { explicit: boolean; ids: string[] } {
  const displayIds = displayClientIdsInOrder(options.clients);
  if (displayIds.length === 0) return { explicit: false, ids: [] };

  const node = options.node;
  if (!node) return { explicit: false, ids: displayIds };

  const config = asRecord(node.config);
  const configDisplayId =
    typeof config?.displayId === 'string' ? String(config.displayId).trim() : '';
  if (configDisplayId) {
    return {
      explicit: true,
      ids: displayIds.includes(configDisplayId) ? [configDisplayId] : [],
    };
  }

  const connections = options.graph?.connections ?? [];
  const isPortConnected = (portId: string): boolean =>
    connections.some(
      (connection) =>
        String(connection.targetNodeId ?? '') === options.nodeId &&
        String(connection.targetPortId ?? '') === portId
    );

  const inputValues = asRecord(node.inputValues) ?? {};
  const hasInputValue = (portId: 'index' | 'range' | 'random'): boolean =>
    Object.prototype.hasOwnProperty.call(inputValues, portId);
  const hasExplicitRoutingInput = (['index', 'range', 'random'] as const).some(
    (portId) => isPortConnected(portId) || hasInputValue(portId)
  );
  if (!hasExplicitRoutingInput) return { explicit: false, ids: displayIds };

  const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
    const computed = options.computedInputs;
    if (isPortConnected(portId) && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
      return computed[portId];
    }
    return inputValues[portId];
  };

  const total = displayIds.length;
  const random = coerceBoolean(getEffectiveInput('random'), false);
  const ordered = random ? buildStableDisplayOrder(options.nodeId, displayIds) : displayIds;
  const index = clampInt(toFiniteNumber(getEffectiveInput('index'), 1), 1, total);
  const range = clampInt(toFiniteNumber(getEffectiveInput('range'), 1), 1, total);
  const ids: string[] = [];
  const start = index - 1;
  for (let i = 0; i < range; i += 1) {
    ids.push(ordered[(start + i) % total]);
  }
  return { explicit: true, ids };
}

function cleanupActionFor(action: ControlAction): { action: ControlAction; payload: ControlPayload } | null {
  switch (action) {
    case 'showText':
      return { action: 'hideText', payload: {} };
    case 'showImage':
      return { action: 'hideImage', payload: {} };
    case 'playMedia':
      return { action: 'stopMedia', payload: {} };
    case 'screenColor':
      return { action: 'screenColor', payload: { color: '#000000', opacity: 0, mode: 'solid' } };
    default:
      return null;
  }
}

function sendDisplayOperationToId(
  options: SendDisplayNodeCommandOptions,
  displayId: string,
  action: ControlAction,
  payload: ControlPayload,
  index: number
): void {
  options.sendDisplayOperation?.(
    createDisplayOperation({
      operationId: `${options.nodeId}:${action}:${Date.now()}:${index}`,
      target: { mode: 'displayId', displayId },
      action,
      payload,
    })
  );
}

export function resetDisplayNodeRouteStateForTests(): void {
  displayRouteStateByNode.clear();
}

export function sendDisplayNodeCommand(options: SendDisplayNodeCommandOptions): {
  route: 'none' | 'local' | 'remote';
  explicit: boolean;
  ids: string[];
} {
  const resolved = resolveDisplayNodeTargets(options);
  if (resolved.explicit) {
    if (!options.sendDisplayOperation || resolved.ids.length === 0) {
      return { route: 'none', explicit: true, ids: resolved.ids };
    }

    const previous = displayRouteStateByNode.get(options.nodeId);
    const cleanup = previous ? cleanupActionFor(previous.action) : null;
    if (previous && cleanup) {
      const nextIds = new Set(resolved.ids);
      previous.ids
        .filter((displayId) => !nextIds.has(displayId))
        .forEach((displayId, index) =>
          sendDisplayOperationToId(options, displayId, cleanup.action, cleanup.payload, index)
        );
    }

    resolved.ids.forEach((displayId, index) => {
      sendDisplayOperationToId(options, displayId, options.action, options.payload, index);
    });
    displayRouteStateByNode.set(options.nodeId, { ids: resolved.ids, action: options.action });

    return { route: 'remote', explicit: true, ids: resolved.ids };
  }

  displayRouteStateByNode.delete(options.nodeId);
  options.sendLocalControl(options.action, options.payload, options.executeAt);
  return { route: 'local', explicit: false, ids: resolved.ids };
}
