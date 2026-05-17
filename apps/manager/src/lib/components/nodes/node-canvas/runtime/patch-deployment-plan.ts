/**
 * Purpose: Pure target planning for manager-driven patch deployment.
 */
import type { Connection, GraphState, NodeDefinition, NodeInstance } from '$lib/nodes/types';
import { buildStableRandomOrder, clampInt, coerceBoolean, toFiniteNumber } from './client-utils';

type AnyRecord = Record<string, unknown>;

type PatchRoot = { id: string; type: string };

export type PatchDeploymentPlan = {
  selectedRoots: PatchRoot[];
  rootIdsByClientId: Map<string, string[]>;
  targetRevisionByClientId: Map<string, string>;
  targetClientIds: string[];
  planKey: string;
};

export type PatchDeploymentPlanOptions = {
  graph: GraphState;
  disabledNodeIds: Set<string>;
  clientIdsInOrder: () => string[];
  audienceClientIdsInOrder: () => string[];
  getManagerClients: () => unknown[];
  localDisplayTargetId: string;
  getDisplayAvailability: () => {
    hasLocalSession: boolean;
    hasLocalReady?: boolean;
    localSessionKey?: string;
  };
  getNodeDefinition: (type: string) => NodeDefinition | undefined;
  getRuntimeNode: (nodeId: string) => NodeInstance | undefined;
  getLastComputedInputs: (nodeId: string) => Record<string, unknown> | null;
  getLastError: () => string | null;
  setLastError: (message: string | null) => void;
};

const PATCH_ROOT_TYPES = new Set([
  'audio-out',
  'image-out',
  'video-out',
  'effect-out',
  'scene-out',
]);

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

export function resolvePatchDeploymentPlan(
  opts: PatchDeploymentPlanOptions
): PatchDeploymentPlan | null {
  const {
    graph,
    disabledNodeIds,
    clientIdsInOrder,
    audienceClientIdsInOrder,
    getManagerClients,
    localDisplayTargetId,
    getDisplayAvailability,
    getNodeDefinition,
    getRuntimeNode,
    getLastComputedInputs,
    getLastError,
    setLastError,
  } = opts;

  const roots = (graph.nodes ?? [])
    .filter((node) => PATCH_ROOT_TYPES.has(String(node.type ?? '')))
    .map((node) => ({ id: String(node.id ?? ''), type: String(node.type ?? '') }))
    .filter((n) => Boolean(n.id));
  const enabledRoots = roots.filter((root) => !disabledNodeIds.has(root.id));
  if (enabledRoots.length === 0) return null;

  const connectedAll = new Set(clientIdsInOrder());
  const connectedAudience = new Set(audienceClientIdsInOrder());
  const connections: Connection[] = graph.connections ?? [];

  const activeRoots = enabledRoots.filter((root) =>
    connections.some((c) => String(c.sourceNodeId) === root.id && String(c.sourcePortId) === 'cmd')
  );

  const formatRootList = (items: { id: string; type: string }[]) =>
    items
      .map((r) => `${r.type}:${r.id}`)
      .sort()
      .join(', ');

  const selectedRoots = (() => {
    if (enabledRoots.length === 1) return enabledRoots;
    if (activeRoots.length >= 1) return activeRoots;
    setLastError(
      `Multiple patch roots found (${formatRootList(enabledRoots)}). Connect Deploy on one or more roots (or delete the others).`
    );
    return null;
  })();

  if (!selectedRoots) return null;

  const outgoingBySourceKey = new Map<string, Connection[]>();
  for (const c of connections) {
    const key = `${String(c.sourceNodeId)}:${String(c.sourcePortId)}`;
    const list = outgoingBySourceKey.get(key) ?? [];
    list.push(c);
    outgoingBySourceKey.set(key, list);
  }

  const typeById = new Map<string, string>();
  for (const n of graph.nodes ?? []) {
    const id = String(n?.id ?? '');
    if (!id) continue;
    typeById.set(id, String(n?.type ?? ''));
  }

  const getCommandOutputPorts = (type: string): string[] => {
    const def = getNodeDefinition(String(type));
    const ports = def?.outputs ?? [];
    return ports.filter((p) => String(p.type) === 'command').map((p) => String(p.id));
  };

  const isCommandInputPort = (type: string, portId: string): boolean => {
    const def = getNodeDefinition(String(type));
    const port = (def?.inputs ?? []).find((p) => String(p.id) === String(portId));
    return Boolean(port) && String(port?.type ?? '') === 'command';
  };

  const resolveClientId = (nodeId: string, outputPortId: string) => {
    const runtimeNode = getRuntimeNode(nodeId);
    const runtimeOut = asRecord(runtimeNode?.outputValues?.[outputPortId]);
    const fromOut =
      typeof runtimeOut?.clientId === 'string' ? String(runtimeOut.clientId).trim() : '';
    const config = asRecord(runtimeNode?.config);
    const fromConfig = typeof config?.clientId === 'string' ? String(config.clientId).trim() : '';
    return fromOut || fromConfig;
  };

  const resolveClientNodeTargets = (nodeId: string): string[] => {
    const runtimeNode = getRuntimeNode(nodeId);
    if (!runtimeNode) return [];
    const computed = getLastComputedInputs(nodeId);
    const isPortConnected = (portId: string) =>
      connections.some(
        (c) =>
          String(c.targetNodeId) === String(nodeId) && String(c.targetPortId) === String(portId)
      );
    const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
      const connected = isPortConnected(portId);
      if (connected && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
        return computed[portId];
      }
      const inputValues = runtimeNode.inputValues as Record<string, unknown> | undefined;
      return inputValues?.[portId];
    };

    const clients = audienceClientIdsInOrder();
    const total = clients.length;
    if (total === 0) return [];

    const randomRaw = getEffectiveInput('random');
    const random = coerceBoolean(randomRaw, false);
    const ordered = random ? buildStableRandomOrder(nodeId, clients) : clients;

    const primaryId = resolveClientId(nodeId, 'out');
    const indexRaw = getEffectiveInput('index');
    const indexCandidate = toFiniteNumber(indexRaw, Number.NaN);
    const indexFromInput = Number.isFinite(indexCandidate)
      ? clampInt(indexCandidate, 1, total)
      : null;
    const indexFromPrimary = primaryId ? ordered.indexOf(primaryId) + 1 : 0;
    const index = indexFromInput ?? (indexFromPrimary > 0 ? indexFromPrimary : 1);

    const rangeRaw = getEffectiveInput('range');
    const rangeCandidate = toFiniteNumber(rangeRaw, 1);
    const range = clampInt(rangeCandidate, 1, total);

    const ids: string[] = [];
    const start = index - 1;
    for (let i = 0; i < range; i += 1) {
      ids.push(ordered[(start + i) % total]);
    }
    return ids;
  };

  const displayClientIdsInOrder = (): string[] =>
    (getManagerClients() ?? [])
      .filter((client) => {
        const record = asRecord(client);
        return String(record?.group ?? '') === 'display' && record?.connected !== false;
      })
      .map((client) => {
        const record = asRecord(client);
        return record ? String(record.clientId ?? '') : '';
      })
      .filter((id) => Boolean(id) && connectedAll.has(id));

  const getTargetRevision = (
    clientId: string,
    availability?: ReturnType<typeof getDisplayAvailability>
  ): string => {
    if (clientId === localDisplayTargetId) {
      return typeof availability?.localSessionKey === 'string' ? availability.localSessionKey : '';
    }

    const client = (getManagerClients() ?? []).find((candidate) => {
      const record = asRecord(candidate);
      return String(record?.clientId ?? '') === clientId;
    });
    const record = asRecord(client);
    const connectedAt = record?.connectedAt;
    return typeof connectedAt === 'number' && Number.isFinite(connectedAt)
      ? String(connectedAt)
      : '';
  };

  const resolveDisplayNodeTargets = (nodeId: string): { explicit: boolean; ids: string[] } => {
    const displayIds = displayClientIdsInOrder();
    if (displayIds.length === 0) return { explicit: false, ids: [] };

    const runtimeNode = getRuntimeNode(nodeId);
    if (!runtimeNode) return { explicit: false, ids: displayIds };

    const config = asRecord(runtimeNode.config);
    const configDisplayId =
      typeof config?.displayId === 'string' ? String(config.displayId).trim() : '';
    if (configDisplayId) {
      return {
        explicit: true,
        ids: displayIds.includes(configDisplayId) ? [configDisplayId] : [],
      };
    }

    const computed = getLastComputedInputs(nodeId);
    const isPortConnected = (portId: string) =>
      connections.some(
        (c) =>
          String(c.targetNodeId) === String(nodeId) && String(c.targetPortId) === String(portId)
      );
    const inputValues = (runtimeNode.inputValues ?? {}) as Record<string, unknown>;
    const hasInputValue = (portId: 'index' | 'range' | 'random') =>
      Object.prototype.hasOwnProperty.call(inputValues, portId);
    const hasExplicitRoutingInput = (['index', 'range', 'random'] as const).some(
      (portId) => isPortConnected(portId) || hasInputValue(portId)
    );
    if (!hasExplicitRoutingInput) return { explicit: false, ids: displayIds };

    const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
      const connected = isPortConnected(portId);
      if (connected && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
        return computed[portId];
      }
      return inputValues[portId];
    };

    const total = displayIds.length;
    const random = coerceBoolean(getEffectiveInput('random'), false);
    const ordered = random ? buildStableRandomOrder(nodeId, displayIds) : displayIds;
    const index = clampInt(toFiniteNumber(getEffectiveInput('index'), 1), 1, total);
    const range = clampInt(toFiniteNumber(getEffectiveInput('range'), 1), 1, total);
    const ids: string[] = [];
    const start = index - 1;
    for (let i = 0; i < range; i += 1) {
      ids.push(ordered[(start + i) % total]);
    }
    return { explicit: true, ids };
  };

  const resolveTargetsForRoot = (rootId: string): string[] => {
    const routedClientNodeIds: string[] = [];
    const routedClientNodeIdSet = new Set<string>();
    const routedDisplayNodeIds: string[] = [];
    const routedDisplayNodeIdSet = new Set<string>();

    const queue: { nodeId: string; portId: string }[] = [{ nodeId: rootId, portId: 'cmd' }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const next = queue.shift()!;
      const visitKey = `${next.nodeId}:${next.portId}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      const outgoing = outgoingBySourceKey.get(visitKey) ?? [];
      for (const c of outgoing) {
        const targetNodeId = String(c?.targetNodeId ?? '');
        if (!targetNodeId) continue;
        const targetPortId = String(c?.targetPortId ?? '');

        const targetType = typeById.get(targetNodeId) ?? '';
        if (!targetType) continue;
        if (!isCommandInputPort(targetType, targetPortId)) continue;

        if (targetType === 'display-object') {
          if (!routedDisplayNodeIdSet.has(targetNodeId)) {
            routedDisplayNodeIdSet.add(targetNodeId);
            routedDisplayNodeIds.push(targetNodeId);
          }
          continue;
        }

        if (targetType === 'client-object') {
          if (!routedClientNodeIdSet.has(targetNodeId)) {
            routedClientNodeIdSet.add(targetNodeId);
            routedClientNodeIds.push(targetNodeId);
          }
          continue;
        }

        for (const outPortId of getCommandOutputPorts(targetType)) {
          queue.push({ nodeId: targetNodeId, portId: outPortId });
        }
      }
    }

    const out: string[] = [];
    const seen = new Set<string>();

    for (const nodeId of routedClientNodeIds) {
      const ids = resolveClientNodeTargets(nodeId);
      for (const id of ids) {
        if (!id || !connectedAudience.has(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }

    if (routedDisplayNodeIds.length > 0) {
      const availability = getDisplayAvailability();
      for (const nodeId of routedDisplayNodeIds) {
        const resolved = resolveDisplayNodeTargets(nodeId);

        if (
          !resolved.explicit &&
          availability.hasLocalReady === true &&
          !seen.has(localDisplayTargetId)
        ) {
          seen.add(localDisplayTargetId);
          out.push(localDisplayTargetId);
        }

        for (const id of resolved.ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
      }
    }

    return out;
  };

  const rootIdSetByClientId = new Map<string, Set<string>>();
  const targetRevisionByClientId = new Map<string, string>();
  for (const root of selectedRoots) {
    const targets = resolveTargetsForRoot(root.id);
    for (const targetId of targets) {
      const set = rootIdSetByClientId.get(targetId) ?? new Set<string>();
      set.add(root.id);
      rootIdSetByClientId.set(targetId, set);
    }
  }

  if (rootIdSetByClientId.size === 0) return null;

  const rootIdsByClientId = new Map<string, string[]>();
  for (const [clientId, set] of rootIdSetByClientId.entries()) {
    rootIdsByClientId.set(clientId, Array.from(set).sort());
  }

  const targetClientIds: string[] = [];
  const seenTargets = new Set<string>();
  const availability = getDisplayAvailability();

  if (rootIdsByClientId.has(localDisplayTargetId)) {
    targetClientIds.push(localDisplayTargetId);
    seenTargets.add(localDisplayTargetId);
  }

  for (const id of clientIdsInOrder()) {
    if (!rootIdsByClientId.has(id) || seenTargets.has(id)) continue;
    seenTargets.add(id);
    targetClientIds.push(id);
  }

  const leftovers = Array.from(rootIdsByClientId.keys())
    .filter((id) => !seenTargets.has(id))
    .sort();
  for (const id of leftovers) {
    seenTargets.add(id);
    targetClientIds.push(id);
  }

  for (const id of rootIdsByClientId.keys()) {
    targetRevisionByClientId.set(id, getTargetRevision(id, availability));
  }

  const prevError = getLastError();
  if (
    typeof prevError === 'string' &&
    (prevError.startsWith('Multiple patch roots found') ||
      prevError.startsWith('Multiple active patch roots found') ||
      prevError.startsWith('Multiple active patch roots have different targets'))
  ) {
    setLastError(null);
  }

  const planKey = Array.from(rootIdsByClientId.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clientId, rootIds]) => `${clientId}=${rootIds.join(',')}`)
    .join('|');

  return { selectedRoots, rootIdsByClientId, targetRevisionByClientId, targetClientIds, planKey };
}
