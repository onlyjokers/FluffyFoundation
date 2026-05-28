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
  activeActions?: Set<ControlAction>;
  payload: ControlPayload;
  executeAt?: number;
  sendLocalControl: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void;
  sendDisplayOperation?: (operation: ReturnType<typeof createDisplayOperation>) => void;
};

type DisplayRouteState = {
  activeByAction: Map<ControlAction, string[]>;
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

const hasOwn = (record: AnyRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

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

  const connections = options.graph?.connections ?? [];
  const isPortConnected = (portId: string): boolean =>
    connections.some(
      (connection) =>
        String(connection.targetNodeId ?? '') === options.nodeId &&
        String(connection.targetPortId ?? '') === portId
    );

  const inputValues = asRecord(node.inputValues) ?? {};
  const hasComputedInput = (portId: 'index' | 'range' | 'random'): boolean =>
    Boolean(options.computedInputs && Object.prototype.hasOwnProperty.call(options.computedInputs, portId));
  const hasLocalInput = (portId: 'index' | 'range' | 'random'): boolean => hasOwn(inputValues, portId);
  const hasExplicitRoutingInput = (['index', 'range', 'random'] as const).some(
    (portId) => isPortConnected(portId) || hasComputedInput(portId) || hasLocalInput(portId)
  );
  const config = asRecord(node.config);
  const configDisplayId =
    typeof config?.displayId === 'string' ? String(config.displayId).trim() : '';
  if (!hasExplicitRoutingInput) {
    if (configDisplayId) {
      return {
        explicit: true,
        ids: displayIds.includes(configDisplayId) ? [configDisplayId] : [],
      };
    }
    return { explicit: false, ids: displayIds };
  }

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
    case 'visualScenes':
      return { action: 'visualScenes', payload: { scenes: [] } };
    case 'visualEffects':
      return { action: 'visualEffects', payload: { effects: [] } };
    default:
      return null;
  }
}

export function cleanupDisplayActionFor(
  action: ControlAction
): { action: ControlAction; payload: ControlPayload } | null {
  return cleanupActionFor(action);
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

function cleanupRouteState(
  options: SendDisplayNodeCommandOptions,
  previous: DisplayRouteState | undefined,
  keepIds: Set<string>
): void {
  if (!previous) return;

  for (const [action, ids] of previous.activeByAction.entries()) {
    const cleanup = cleanupActionFor(action);
    const kept = ids.filter((displayId) => keepIds.has(displayId));
    if (!cleanup) continue;

    if (options.activeActions && !options.activeActions.has(action)) {
      ids.forEach((displayId, index) =>
        sendDisplayOperationToId(options, displayId, cleanup.action, cleanup.payload, index)
      );
      previous.activeByAction.delete(action);
      continue;
    }
    ids
      .filter((displayId) => !keepIds.has(displayId))
      .forEach((displayId, index) =>
        sendDisplayOperationToId(options, displayId, cleanup.action, cleanup.payload, index)
      );
    if (kept.length > 0) {
      previous.activeByAction.set(action, kept);
    } else {
      previous.activeByAction.delete(action);
    }
  }
}

export function resetDisplayNodeRouteStateForTests(): void {
  displayRouteStateByNode.clear();
}

export function sendDisplayNodeCommand(options: SendDisplayNodeCommandOptions): {
  route: 'none' | 'local' | 'remote' | 'local+remote';
  explicit: boolean;
  ids: string[];
} {
  const resolved = resolveDisplayNodeTargets(options);
  if (resolved.explicit) {
    if (!options.sendDisplayOperation) {
      return { route: 'none', explicit: true, ids: resolved.ids };
    }

    const previous = displayRouteStateByNode.get(options.nodeId);
    if (resolved.ids.length === 0) {
      cleanupRouteState(options, previous, new Set());
      displayRouteStateByNode.delete(options.nodeId);
      return { route: 'none', explicit: true, ids: resolved.ids };
    }

    const nextIds = new Set(resolved.ids);
    cleanupRouteState(options, previous, nextIds);

    resolved.ids.forEach((displayId, index) => {
      sendDisplayOperationToId(options, displayId, options.action, options.payload, index);
    });
    const nextState: DisplayRouteState = previous ?? { activeByAction: new Map() };
    if (cleanupActionFor(options.action)) {
      nextState.activeByAction.set(options.action, resolved.ids);
      displayRouteStateByNode.set(options.nodeId, nextState);
    } else if (nextState.activeByAction.size > 0) {
      displayRouteStateByNode.set(options.nodeId, nextState);
    } else {
      displayRouteStateByNode.delete(options.nodeId);
    }

    return { route: 'remote', explicit: true, ids: resolved.ids };
  }

  const previous = displayRouteStateByNode.get(options.nodeId);
  cleanupRouteState(options, previous, new Set());
  displayRouteStateByNode.delete(options.nodeId);
  options.sendLocalControl(options.action, options.payload, options.executeAt);
  if (options.sendDisplayOperation) {
    resolved.ids.forEach((displayId, index) => {
      sendDisplayOperationToId(options, displayId, options.action, options.payload, index);
    });
    return { route: 'local+remote', explicit: false, ids: resolved.ids };
  }
  return { route: 'local', explicit: false, ids: resolved.ids };
}
