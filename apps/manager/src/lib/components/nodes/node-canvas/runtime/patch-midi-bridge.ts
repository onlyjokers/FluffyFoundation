/**
 * Purpose: Manage MIDI-driven runtime input overrides for deployed node-executor patches.
 */
import { get, type Readable } from 'svelte/store';
import type { GraphState, NodeInstance, PortType } from '$lib/nodes/types';
import type {
  DeployedPatch,
  LoopControllerLike,
  MidiBridgeRoute,
  NodeEngineLike,
  NodeOverride,
  NodeRegistryLike,
} from './patch-runtime-types';

type MidiLoopBridgeTarget = { loopId: string; clientId: string; nodeIds: Set<string> };

export type PatchMidiBridgeOptions = {
  isRunningStore: Readable<boolean>;
  getGraphState: () => GraphState;
  nodeRegistry: NodeRegistryLike;
  nodeEngine: NodeEngineLike;
  loopController: LoopControllerLike | null;
  getDeployedPatches: () => Iterable<[string, DeployedPatch]>;
  sendNodeExecutorPluginControl: (targetId: string, command: string, payload: unknown) => void;
};

export type PatchMidiBridge = {
  syncPatchRoutes: (patchId: string, patchNodeIds: Set<string>) => void;
  resetPatchOverrides: () => void;
  removePatchClient: (clientId: string, patchId: string) => void;
  clearLoopState: () => void;
  markLoopDirty: () => void;
  resetLoopOverrides: () => void;
  sendPatchOverrides: () => void;
  sendLoopOverrides: () => void;
};

export function computeMidiBridgeRoutes(
  graph: GraphState,
  nodeRegistry: NodeRegistryLike,
  patchNodeIds: Set<string>
): { routes: MidiBridgeRoute[]; keys: Set<string> } {
  const nodeById = new Map((graph.nodes ?? []).map((n) => [String(n.id), n] as const));
  const routes: MidiBridgeRoute[] = [];
  const keys = new Set<string>();

  for (const c of graph.connections ?? []) {
    const targetNodeId = String(c.targetNodeId);
    const targetPortId = String(c.targetPortId);
    if (!patchNodeIds.has(targetNodeId)) continue;

    const sourceNodeId = String(c.sourceNodeId);
    const sourcePortId = String(c.sourcePortId);
    const sourceNode = nodeById.get(sourceNodeId);
    if (!sourceNode || !isMidiNodeType(sourceNode)) continue;

    const targetNode = nodeById.get(targetNodeId);
    if (!targetNode) continue;
    const def = nodeRegistry.get(String(targetNode.type));
    const port = def?.inputs?.find((p) => String(p.id) === targetPortId) ?? null;
    if (!port || port.kind === 'sink') continue;
    const targetType = (port.type ?? 'any') as PortType;

    const key = `${targetNodeId}|${targetPortId}`;
    keys.add(key);
    routes.push({ sourceNodeId, sourcePortId, targetNodeId, targetPortId, targetType, key });
  }

  routes.sort((a, b) => a.key.localeCompare(b.key) || a.sourceNodeId.localeCompare(b.sourceNodeId));
  return { routes, keys };
}

export function createPatchMidiBridge(options: PatchMidiBridgeOptions): PatchMidiBridge {
  const {
    isRunningStore,
    getGraphState,
    nodeRegistry,
    nodeEngine,
    loopController,
    getDeployedPatches,
    sendNodeExecutorPluginControl,
  } = options;

  let patchRoutes: MidiBridgeRoute[] = [];
  let patchActiveKeysByClientId = new Map<string, Set<string>>();
  let patchLastSignatureByClientKey = new Map<string, string>();
  let patchLastSendAt = 0;
  let loopRoutesByLoopId = new Map<string, MidiBridgeRoute[]>();
  let loopActiveKeysByLoopId = new Map<string, Set<string>>();
  let loopLastSignatureByClientKey = new Map<string, string>();
  let loopLastSendAt = 0;
  let loopDirty = true;

  const syncPatchRoutes = (patchId: string, patchNodeIds: Set<string>) => {
    const deployedPatches = Array.from(getDeployedPatches());
    if (!patchId || patchNodeIds.size === 0 || deployedPatches.length === 0) {
      patchRoutes = [];
      patchActiveKeysByClientId = new Map();
      patchLastSignatureByClientKey = new Map();
      return;
    }

    const { routes, keys } = computeMidiBridgeRoutes(getGraphState(), nodeRegistry, patchNodeIds);
    patchRoutes = routes;
    for (const [clientId, patch] of deployedPatches) {
      const prev = patchActiveKeysByClientId.get(clientId) ?? new Set<string>();
      removeStaleOverrides(clientId, patch.patchId, prev, keys, patchLastSignatureByClientKey);
      patchActiveKeysByClientId.set(clientId, new Set(keys));
    }
  };

  const getLoopTargets = (): MidiLoopBridgeTarget[] => {
    if (!loopController) return [];
    const deployed = get(loopController.deployedLoopIds);
    if (!deployed || deployed.size === 0) return [];

    const targets: MidiLoopBridgeTarget[] = [];
    for (const loop of get(loopController.localLoops) ?? []) {
      const record = asRecord(loop);
      const loopId = String(record?.id ?? '');
      if (!loopId || !deployed.has(loopId)) continue;
      const clientId = loopController.loopActions.getLoopClientId(loop);
      if (!clientId) continue;
      const nodeIdsRaw = Array.isArray(record?.nodeIds) ? record?.nodeIds : [];
      const nodeIds = new Set(nodeIdsRaw.map((id) => String(id)).filter(Boolean));
      if (nodeIds.size > 0) targets.push({ loopId, clientId: String(clientId), nodeIds });
    }

    targets.sort((a, b) => a.loopId.localeCompare(b.loopId) || a.clientId.localeCompare(b.clientId));
    return targets;
  };

  const syncLoopRoutes = () => {
    const targets = getLoopTargets();
    if (targets.length === 0) {
      clearLoopState();
      return;
    }

    const activeLoopIds = new Set(targets.map((t) => t.loopId));
    for (const loopId of Array.from(loopRoutesByLoopId.keys())) {
      if (activeLoopIds.has(loopId)) continue;
      loopRoutesByLoopId.delete(loopId);
      loopActiveKeysByLoopId.delete(loopId);
    }

    for (const target of targets) {
      const { routes, keys } = computeMidiBridgeRoutes(getGraphState(), nodeRegistry, target.nodeIds);
      loopRoutesByLoopId.set(target.loopId, routes);
      const prev = loopActiveKeysByLoopId.get(target.loopId) ?? new Set<string>();
      removeStaleOverrides(target.clientId, target.loopId, prev, keys, loopLastSignatureByClientKey);
      loopActiveKeysByLoopId.set(target.loopId, new Set(keys));
    }

    loopDirty = false;
  };

  const removeStaleOverrides = (
    clientId: string,
    loopId: string,
    prev: Set<string>,
    next: Set<string>,
    signatures: Map<string, string>
  ) => {
    const toRemove = Array.from(prev).filter((key) => !next.has(key));
    if (toRemove.length === 0) return;

    const overrides = toRemove.map((key) => {
      const [nodeId, portId] = key.split('|');
      return { nodeId, kind: 'input', portId };
    });
    sendNodeExecutorPluginControl(String(clientId), 'override-remove', { loopId, overrides });

    for (const key of toRemove) {
      const [nodeId, portId] = key.split('|');
      signatures.delete(bridgeClientKey(clientId, loopId, nodeId, portId));
    }
  };

  const sendPatchOverrides = () => {
    const deployedPatches = Array.from(getDeployedPatches());
    if (!get(isRunningStore) || patchRoutes.length === 0 || deployedPatches.length === 0) return;
    const now = Date.now();
    if (now - patchLastSendAt < 30) return;
    patchLastSendAt = now;

    for (const [clientId, patch] of deployedPatches) {
      const activeKeys = patchActiveKeysByClientId.get(clientId) ?? new Set<string>();
      sendOverridesForRoutes({
        clientId,
        loopId: patch.patchId,
        routes: patchRoutes,
        activeKeys,
        signatures: patchLastSignatureByClientKey,
      });
      patchActiveKeysByClientId.set(clientId, activeKeys);
    }
  };

  const sendLoopOverrides = () => {
    if (!get(isRunningStore)) return;
    const targets = getLoopTargets();
    if (targets.length === 0) return;
    if (loopDirty) syncLoopRoutes();

    const now = Date.now();
    if (now - loopLastSendAt < 30) return;
    loopLastSendAt = now;

    for (const target of targets) {
      const routes = loopRoutesByLoopId.get(target.loopId) ?? [];
      if (routes.length === 0) continue;
      const activeKeys = loopActiveKeysByLoopId.get(target.loopId) ?? new Set<string>();
      sendOverridesForRoutes({
        clientId: target.clientId,
        loopId: target.loopId,
        routes,
        activeKeys,
        signatures: loopLastSignatureByClientKey,
      });
      loopActiveKeysByLoopId.set(target.loopId, activeKeys);
    }
  };

  const sendOverridesForRoutes = (params: {
    clientId: string;
    loopId: string;
    routes: MidiBridgeRoute[];
    activeKeys: Set<string>;
    signatures: Map<string, string>;
  }) => {
    const overrides: NodeOverride[] = [];
    const removals: NodeOverride[] = [];

    for (const route of params.routes) {
      const sourceNode = nodeEngine.getNode(route.sourceNodeId);
      const coerced = coerceForPortType(sourceNode?.outputValues?.[route.sourcePortId], route.targetType);
      const key = bridgeClientKey(params.clientId, params.loopId, route.targetNodeId, route.targetPortId);
      if (coerced === undefined) {
        if (params.activeKeys.has(route.key)) {
          params.activeKeys.delete(route.key);
          params.signatures.delete(key);
          removals.push({ nodeId: route.targetNodeId, kind: 'input', portId: route.targetPortId });
        }
        continue;
      }

      const sig = signatureForValue(coerced, route.targetType);
      if (params.signatures.get(key) === sig) {
        params.activeKeys.add(route.key);
        continue;
      }

      params.signatures.set(key, sig);
      params.activeKeys.add(route.key);
      overrides.push({ nodeId: route.targetNodeId, kind: 'input', portId: route.targetPortId, value: coerced });
    }

    if (removals.length > 0) {
      sendNodeExecutorPluginControl(String(params.clientId), 'override-remove', {
        loopId: params.loopId,
        overrides: removals,
      });
    }
    if (overrides.length > 0) {
      sendNodeExecutorPluginControl(String(params.clientId), 'override-set', {
        loopId: params.loopId,
        overrides,
      });
    }
  };

  const clearLoopState = () => {
    loopRoutesByLoopId = new Map();
    loopActiveKeysByLoopId = new Map();
    loopLastSignatureByClientKey = new Map();
    loopDirty = true;
  };

  return {
    syncPatchRoutes,
    resetPatchOverrides: () => {
      patchLastSignatureByClientKey = new Map();
      patchActiveKeysByClientId = new Map();
    },
    removePatchClient: (clientId, patchId) => {
      patchActiveKeysByClientId.delete(clientId);
      const prefix = `${clientId}|${patchId}|`;
      for (const key of Array.from(patchLastSignatureByClientKey.keys())) {
        if (key.startsWith(prefix)) patchLastSignatureByClientKey.delete(key);
      }
    },
    clearLoopState,
    markLoopDirty: () => {
      loopDirty = true;
    },
    resetLoopOverrides: () => {
      loopDirty = true;
      loopLastSignatureByClientKey = new Map();
      loopActiveKeysByLoopId = new Map();
    },
    sendPatchOverrides,
    sendLoopOverrides,
  };
}

function isMidiNodeType(node: NodeInstance): boolean {
  return String(node.type).startsWith('midi-');
}

function coerceForPortType(value: unknown, type: PortType): unknown | undefined {
  if (value === undefined || value === null) return undefined;
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    return undefined;
  }
  if (type === 'string') return typeof value === 'string' ? value : String(value);
  if (type === 'color') return typeof value === 'string' ? value : undefined;
  return value;
}

function signatureForValue(value: unknown, type: PortType): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 'nan';
    return `n:${Math.round(n * 1_000_000) / 1_000_000}`;
  }
  if (type === 'boolean') return `b:${Boolean(value)}`;
  if (type === 'string' || type === 'color') return `s:${String(value)}`;
  try {
    return `j:${JSON.stringify(value)}`;
  } catch {
    return `u:${String(value)}`;
  }
}

function bridgeClientKey(clientId: string, loopId: string, nodeId: string, portId: string): string {
  return `${clientId}|${loopId}|${nodeId}|${portId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}
