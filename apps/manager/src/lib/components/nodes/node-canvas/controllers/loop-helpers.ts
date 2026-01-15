/**
 * Purpose: Shared loop deployment helpers for the node canvas.
 */
import type { LocalLoop } from '$lib/nodes';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { NodeEngine } from '$lib/nodes/engine';

export type DeployPendingEntry = { clientId: string; timeoutId: ReturnType<typeof setTimeout> | null };

export type ExecutorLogEntry = {
  at: number;
  event: string;
  loopId: string | null;
  error: string | null;
  payload: Record<string, unknown>;
};

export type ExecutorClientStatus = {
  running: boolean;
  loopId: string | null;
  lastEvent: string;
  lastError: string | null;
  lastSeenAt: number;
  log: ExecutorLogEntry[];
};

export type ExecutorStatusMap = Map<string, ExecutorClientStatus>;

export type ManagerSdkLike = {
  sendPluginControl: (
    target: { mode: string; ids: string[] },
    plugin: string,
    event: string,
    payload: Record<string, unknown>
  ) => void;
  stopSound: (force?: boolean) => void;
  stopMedia: (force?: boolean) => void;
  hideImage: (force?: boolean) => void;
  flashlight: (mode: string, intensity?: number, force?: boolean) => void;
  screenColor: (payload: Record<string, unknown>, force?: boolean) => void;
};

export type LoopActionsOptions = {
  getSDK: () => ManagerSdkLike | null;
  getGraphState: () => Pick<GraphState, 'nodes'>;
  getLocalLoops: () => LocalLoop[];
  getDeployedLoopIds: () => Set<string>;
  getDeployPendingByLoopId: () => Map<string, DeployPendingEntry>;
  getDeployedLoopClientIdByLoopId: () => Map<string, string>;
  setDeployPendingByLoopId: (next: Map<string, DeployPendingEntry>) => void;
  setDeployedLoopClientIdByLoopId: (next: Map<string, string>) => void;
  markLoopDeployed: (loopId: string, deployed: boolean) => void;
  exportGraphForLoop: (loopId: string) => ReturnType<NodeEngine['exportGraphForLoop']>;
  isRunning: () => boolean;
  onDeployTimeout?: (loopId: string) => void;
  onDeployError?: (message: string) => void;
  onDeployMissingClient?: () => void;
  onMissingSdk?: () => void;
};

export type LoopActions = {
  getLoopClientId: (loop: LocalLoop) => string;
  getDeployedLoopForNode: (nodeId: string) => LocalLoop | null;
  isLoopDeploying: (loopId: string) => boolean;
  clearLoopDeployPending: (loopId: string) => void;
  setLoopDeployPending: (loopId: string, clientId: string) => void;
  deployLoop: (loop: LocalLoop) => void;
  stopLoop: (loop: LocalLoop) => void;
  stopAndRemoveLoopById: (loopId: string, clientId: string) => void;
  stopAllDeployedLoops: () => void;
  removeLoop: (loop: LocalLoop) => void;
  stopAllClientEffects: () => void;
};

export function loopHasDisabledNodes(loop: LocalLoop, disabledNodeIds: Set<string>): boolean {
  for (const nodeId of loop.nodeIds ?? []) {
    if (disabledNodeIds.has(String(nodeId))) return true;
  }
  return false;
}

export function updateExecutorStatus(
  statusByClient: ExecutorStatusMap,
  clientId: string,
  entry: ExecutorLogEntry
): ExecutorStatusMap {
  const next = new Map(statusByClient);
  const prev =
    next.get(clientId) ??
    ({
      running: false,
      loopId: null,
      lastEvent: 'unknown',
      lastError: null,
      lastSeenAt: 0,
      log: [],
    } as ExecutorClientStatus);

  const log = [...prev.log, entry].slice(-30);
  const running =
    entry.event === 'deployed' || entry.event === 'started'
      ? true
      : entry.event === 'stopped' || entry.event === 'removed' || entry.event === 'rejected'
        ? false
        : prev.running;

  next.set(clientId, {
    running,
    loopId: entry.loopId ?? prev.loopId,
    lastEvent: entry.event,
    lastError: entry.error ?? prev.lastError,
    lastSeenAt: entry.at,
    log,
  });
  return next;
}

export function createLoopActions(opts: LoopActionsOptions): LoopActions {
  const {
    getSDK,
    getGraphState,
    getLocalLoops,
    getDeployedLoopIds,
    getDeployPendingByLoopId,
    getDeployedLoopClientIdByLoopId,
    setDeployPendingByLoopId,
    setDeployedLoopClientIdByLoopId,
    markLoopDeployed,
    exportGraphForLoop,
    isRunning,
    onDeployTimeout,
    onDeployError,
    onDeployMissingClient,
    onMissingSdk,
  } = opts;

  const getLoopClientId = (loop: LocalLoop): string => {
    const clientNodeId = loop.clientsInvolved?.[0] ?? '';
    const node = getGraphState().nodes.find((n: NodeInstance) => String(n.id) === String(clientNodeId));
    const id = node?.config?.clientId;
    return typeof id === 'string' ? id : '';
  };

  const getDeployedLoopForNode = (nodeId: string): LocalLoop | null => {
    for (const loop of getLocalLoops()) {
      if (!getDeployedLoopIds().has(loop.id)) continue;
      if (loop.nodeIds.includes(nodeId)) return loop;
    }
    return null;
  };

  const clearLoopDeployPending = (loopId: string) => {
    const existing = getDeployPendingByLoopId().get(loopId);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    const next = new Map(getDeployPendingByLoopId());
    next.delete(loopId);
    setDeployPendingByLoopId(next);
  };

  const setLoopDeployPending = (loopId: string, clientId: string) => {
    const next = new Map(getDeployPendingByLoopId());
    const existing = next.get(loopId);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);

    const timeoutId = setTimeout(() => {
      if (!getDeployPendingByLoopId().has(loopId)) return;
      clearLoopDeployPending(loopId);
      onDeployTimeout?.(loopId);
    }, 8000);

    next.set(loopId, { clientId, timeoutId });
    setDeployPendingByLoopId(next);
  };

  const isLoopDeploying = (loopId: string) => getDeployPendingByLoopId().has(loopId);

  const deployLoop = (loop: LocalLoop) => {
    if (!isRunning()) return;
    const clientId = getLoopClientId(loop);
    if (!clientId) {
      onDeployMissingClient?.();
      return;
    }
    const sdk = getSDK();
    if (!sdk) {
      onMissingSdk?.();
      return;
    }

    try {
      const payload = exportGraphForLoop(loop.id);
      sdk.sendPluginControl({ mode: 'clientIds', ids: [clientId] }, 'node-executor', 'deploy', payload);
      setLoopDeployPending(loop.id, clientId);
    } catch (err) {
      onDeployError?.(err instanceof Error ? err.message : 'Deploy failed');
    }
  };

  const stopLoop = (loop: LocalLoop) => {
    const clientId = getLoopClientId(loop);
    if (!clientId) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendPluginControl({ mode: 'clientIds', ids: [clientId] }, 'node-executor', 'stop', {
      loopId: loop.id,
    });
    markLoopDeployed(loop.id, false);
  };

  const stopAndRemoveLoopById = (loopId: string, clientId: string) => {
    if (!loopId || !clientId) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendPluginControl({ mode: 'clientIds', ids: [clientId] }, 'node-executor', 'stop', {
      loopId,
    });
    sdk.sendPluginControl({ mode: 'clientIds', ids: [clientId] }, 'node-executor', 'remove', {
      loopId,
    });
  };

  const stopAllDeployedLoops = () => {
    const sdk = getSDK();
    if (!sdk) return;

    const loopById = new Map(getLocalLoops().map((loop) => [loop.id, loop]));
    const nextClientMap = new Map(getDeployedLoopClientIdByLoopId());
    const pendingLoopIds = Array.from(getDeployPendingByLoopId().keys());
    const loopIds = new Set<string>([...getDeployedLoopIds(), ...pendingLoopIds]);

    for (const loopId of loopIds) {
      const loop = loopById.get(loopId);
      const clientId =
        nextClientMap.get(loopId) ?? getDeployPendingByLoopId().get(loopId)?.clientId ?? (loop ? getLoopClientId(loop) : '');
      if (!clientId) continue;
      stopAndRemoveLoopById(loopId, clientId);
      markLoopDeployed(loopId, false);
      nextClientMap.delete(loopId);
    }

    setDeployedLoopClientIdByLoopId(nextClientMap);
    setDeployPendingByLoopId(new Map());
  };

  const removeLoop = (loop: LocalLoop) => {
    const clientId = getLoopClientId(loop);
    if (!clientId) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendPluginControl({ mode: 'clientIds', ids: [clientId] }, 'node-executor', 'remove', {
      loopId: loop.id,
    });
    markLoopDeployed(loop.id, false);
  };

  const stopAllClientEffects = () => {
    const sdk = getSDK();
    if (!sdk) return;
    sdk.stopSound(true);
    sdk.stopMedia(true);
    sdk.hideImage(true);
    sdk.flashlight('off', undefined, true);
    sdk.screenColor({ color: '#000000', opacity: 0, mode: 'solid' }, true);
  };

  return {
    getLoopClientId,
    getDeployedLoopForNode,
    isLoopDeploying,
    clearLoopDeployPending,
    setLoopDeployPending,
    deployLoop,
    stopLoop,
    stopAndRemoveLoopById,
    stopAllDeployedLoops,
    removeLoop,
    stopAllClientEffects,
  };
}
