/**
 * Purpose: Loop frames, deployment state, and executor log handling for NodeCanvas.
 */
import { get, writable, type Writable } from 'svelte/store';
import type { LocalLoop } from '$lib/nodes';
import { sensorData } from '$lib/stores/manager';
import type { GraphState } from '$lib/nodes/types';
import type { NodeEngine } from '$lib/nodes/engine';
import type { GraphViewAdapter, NodeBounds } from '../adapters';
import {
  createLoopActions,
  loopHasDisabledNodes,
  updateExecutorStatus,
  type DeployPendingEntry,
  type ExecutorStatusMap,
  type LoopActions,
  type ManagerSdkLike,
} from './loop-helpers';

export type LoopFrame = { loop: LocalLoop; left: number; top: number; width: number; height: number };

type LoopControllerOptions = {
  nodeEngine: Pick<
    NodeEngine,
    'localLoops' | 'deployedLoops' | 'markLoopDeployed' | 'exportGraphForLoop'
  >;
  getSDK: () => ManagerSdkLike | null;
  isRunning: () => boolean;
  getGraphState: () => GraphState;
  getAdapter: () => GraphViewAdapter | null;
  getGroupDisabledNodeIds: () => Set<string>;
  isSyncingGraph: () => boolean;
  onDeployTimeout: (loopId: string) => void;
  onDeployError: (message: string) => void;
  onDeployMissingClient: () => void;
  onMissingSdk: () => void;
  onLoopVanished: (loopId: string, clientId: string) => void;
  onLoopFrameReady: (loop: LocalLoop) => void;
};

export type LoopController = {
  localLoops: Writable<LocalLoop[]>;
  deployedLoopIds: Writable<Set<string>>;
  loopFrames: Writable<LoopFrame[]>;
  executorStatusByClient: Writable<ExecutorStatusMap>;
  showExecutorLogs: Writable<boolean>;
  logsClientId: Writable<string>;
  deployedNodeIds: Writable<Set<string>>;
  deployedConnIds: Writable<Set<string>>;
  localLoopConnIds: Writable<Set<string>>;
  loopActions: LoopActions;
  isLoopDeploying: (loopId: string) => boolean;
  loopHasDisabledNodes: (loop: LocalLoop) => boolean;
  toggleLoopLogs: (loop: LocalLoop) => void;
  getEffectiveLoops: () => LocalLoop[];
  autoAddNodeToLoopFromConnectDrop: (
    initialNodeId: string,
    newNodeId: string,
    dropGraphPos: { x: number; y: number }
  ) => void;
  requestFramesUpdate: () => void;
  applyHighlights: () => Promise<void>;
  scheduleHighlight: () => void;
  destroy: () => void;
};

export function createLoopController(opts: LoopControllerOptions): LoopController {
  const localLoops = writable<LocalLoop[]>([]);
  const deployedLoopIds = writable<Set<string>>(new Set());
  const loopFrames = writable<LoopFrame[]>([]);
  const deployedNodeIds = writable<Set<string>>(new Set());
  const deployedConnIds = writable<Set<string>>(new Set());
  const localLoopConnIds = writable<Set<string>>(new Set());
  const localLoopNodeIds = writable<Set<string>>(new Set());

  const executorStatusByClient = writable<ExecutorStatusMap>(new Map());
  const showExecutorLogs = writable(false);
  const logsClientId = writable('');

  let deployPendingByLoopId = new Map<string, DeployPendingEntry>();
  let deployedLoopClientIdByLoopId = new Map<string, string>();

  let loopHighlightDirty = false;
  let loopFramesRaf = 0;
  let loopsUnsub: (() => void) | null = null;
  let deployedLoopsUnsub: (() => void) | null = null;
  let sensorUnsub: (() => void) | null = null;
  const executorLastServerTimestampByClient = new Map<string, number>();

  // Loop membership extensions (UI-only): when a node is created by connection-drop inside a loop frame,
  // we treat it as part of that loop for frame bounds + local highlighting.
  // Keyed by the loop's client-node id so it survives loopId churn when SCC membership changes.
  let extraLoopNodeIdsByClientNodeId = new Map<string, Set<string>>();

  const loopClientNodeId = (loop: LocalLoop): string => String(loop.clientsInvolved?.[0] ?? '');

  const getExtraNodeIdsForLoop = (loop: LocalLoop): string[] => {
    const clientNodeId = loopClientNodeId(loop);
    const set = clientNodeId ? extraLoopNodeIdsByClientNodeId.get(clientNodeId) : undefined;
    return set ? Array.from(set) : [];
  };

  const getEffectiveLoopNodeIds = (loop: LocalLoop): string[] => {
    const ids = new Set<string>((loop.nodeIds ?? []).map((id) => String(id)));
    for (const extraId of getExtraNodeIdsForLoop(loop)) ids.add(String(extraId));
    return Array.from(ids);
  };

  const getEffectiveLoops = (): LocalLoop[] => {
    const loops = get(localLoops);
    if (loops.length === 0) return [];
    return loops.map((loop) => ({ ...loop, nodeIds: getEffectiveLoopNodeIds(loop) }));
  };

  const loopActions = createLoopActions({
    getSDK: opts.getSDK,
    getGraphState: opts.getGraphState,
    getLocalLoops: () => get(localLoops),
    getDeployedLoopIds: () => get(deployedLoopIds),
    getDeployPendingByLoopId: () => deployPendingByLoopId,
    getDeployedLoopClientIdByLoopId: () => deployedLoopClientIdByLoopId,
    setDeployPendingByLoopId: (next) => (deployPendingByLoopId = next),
    setDeployedLoopClientIdByLoopId: (next) => (deployedLoopClientIdByLoopId = next),
    markLoopDeployed: (loopId, deployed) => opts.nodeEngine.markLoopDeployed(loopId, deployed),
    exportGraphForLoop: (loopId) => opts.nodeEngine.exportGraphForLoop(loopId),
    isRunning: opts.isRunning,
    onDeployTimeout: opts.onDeployTimeout,
    onDeployError: opts.onDeployError,
    onDeployMissingClient: opts.onDeployMissingClient,
    onMissingSdk: opts.onMissingSdk,
  });

  const recomputeLoopHighlightSets = () => {
    const loops = get(localLoops);
    const deployedIds = get(deployedLoopIds);
    const localNodes = new Set<string>();
    const localConns = new Set<string>();
    const deployedNodes = new Set<string>();
    const deployedConns = new Set<string>();

    for (const loop of loops) {
      for (const nid of loop.nodeIds) localNodes.add(nid);
      for (const nid of getExtraNodeIdsForLoop(loop)) localNodes.add(nid);
      for (const cid of loop.connectionIds) localConns.add(cid);
      if (!deployedIds.has(loop.id)) continue;
      for (const nid of loop.nodeIds) deployedNodes.add(nid);
      for (const cid of loop.connectionIds) deployedConns.add(cid);
    }

    localLoopNodeIds.set(localNodes);
    localLoopConnIds.set(localConns);
    deployedNodeIds.set(deployedNodes);
    deployedConnIds.set(deployedConns);
    scheduleHighlight();
  };

  const scheduleHighlight = () => {
    loopHighlightDirty = true;
    if (!opts.isSyncingGraph()) void applyHighlights();
  };

  const applyHighlights = async () => {
    const adapter = opts.getAdapter();
    if (!adapter) return;
    if (!loopHighlightDirty) return;
    loopHighlightDirty = false;

    const localNodes = get(localLoopNodeIds);
    const deployedNodes = get(deployedNodeIds);
    const localConns = get(localLoopConnIds);
    const deployedConns = get(deployedConnIds);

    const graph = opts.getGraphState();

    for (const node of graph.nodes ?? []) {
      const id = String(node.id);
      if (!id) continue;

      const nextLocal = localNodes.has(id);
      const nextDeployed = deployedNodes.has(id);
      const prev = adapter.getNodeVisualState(id);

      const patch: { localLoop?: boolean; deployedLoop?: boolean } = {};
      if (Boolean(prev?.localLoop) !== nextLocal) patch.localLoop = nextLocal;
      if (Boolean(prev?.deployedLoop) !== nextDeployed) patch.deployedLoop = nextDeployed;
      if (Object.keys(patch).length > 0) await adapter.setNodeVisualState(id, patch);
    }

    for (const conn of graph.connections ?? []) {
      const id = String(conn.id);
      if (!id) continue;

      const nextLocal = localConns.has(id);
      const nextDeployed = deployedConns.has(id);
      const prev = adapter.getConnectionVisualState(id);

      const patch: { localLoop?: boolean; deployedLoop?: boolean } = {};
      if (Boolean(prev?.localLoop) !== nextLocal) patch.localLoop = nextLocal;
      if (Boolean(prev?.deployedLoop) !== nextDeployed) patch.deployedLoop = nextDeployed;
      if (Object.keys(patch).length > 0) await adapter.setConnectionVisualState(id, patch);
    }
  };

  const computeLoopFrames = () => {
    const adapter = opts.getAdapter();
    if (!adapter) {
      loopFrames.set([]);
      return;
    }

    const paddingX = 56;
    const paddingTop = 64;
    const paddingBottom = 64;

    const frames: LoopFrame[] = [];
    for (const loop of get(localLoops)) {
      let bounds: NodeBounds | null = null;
      for (const nodeId of getEffectiveLoopNodeIds(loop)) {
        const b = adapter.getNodeBounds(String(nodeId));
        if (!b) continue;
        if (!bounds) bounds = { ...b };
        else {
          bounds = {
            left: Math.min(bounds.left, b.left),
            top: Math.min(bounds.top, b.top),
            right: Math.max(bounds.right, b.right),
            bottom: Math.max(bounds.bottom, b.bottom),
          };
        }
      }
      if (!bounds) continue;
      const left = bounds.left;
      const top = bounds.top;
      const right = bounds.right;
      const bottom = bounds.bottom;

      const localLeft = left - paddingX;
      const localTop = top - paddingTop;
      const localWidth = right - left + paddingX * 2;
      const localHeight = bottom - top + paddingTop + paddingBottom;

      frames.push({
        loop,
        left: localLeft,
        top: localTop,
        width: localWidth,
        height: localHeight,
      });
    }

    loopFrames.set(frames);
  };

  const autoAddNodeToLoopFromConnectDrop = (
    initialNodeId: string,
    newNodeId: string,
    dropGraphPos: { x: number; y: number }
  ) => {
    const initialId = String(initialNodeId ?? '');
    const createdId = String(newNodeId ?? '');
    if (!initialId || !createdId) return;

    const adapter = opts.getAdapter();
    if (!adapter) return;

    const gx = Number(dropGraphPos?.x);
    const gy = Number(dropGraphPos?.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;

    const candidates = get(localLoops).filter((l) => (l.nodeIds ?? []).some((id) => String(id) === initialId));
    if (candidates.length === 0) return;

    const paddingX = 56;
    const paddingTop = 64;
    const paddingBottom = 64;

    let picked: LocalLoop | null = null;
    let pickedArea = Number.POSITIVE_INFINITY;

    for (const loop of candidates) {
      let bounds: NodeBounds | null = null;
      for (const nodeId of getEffectiveLoopNodeIds(loop)) {
        const b = adapter.getNodeBounds(String(nodeId));
        if (!b) continue;
        if (!bounds) bounds = { ...b };
        else {
          bounds = {
            left: Math.min(bounds.left, b.left),
            top: Math.min(bounds.top, b.top),
            right: Math.max(bounds.right, b.right),
            bottom: Math.max(bounds.bottom, b.bottom),
          };
        }
      }
      if (!bounds) continue;

      const left = bounds.left - paddingX;
      const top = bounds.top - paddingTop;
      const right = bounds.right + paddingX;
      const bottom = bounds.bottom + paddingBottom;

      const inside = gx >= left && gx <= right && gy >= top && gy <= bottom;
      if (!inside) continue;

      const area = (right - left) * (bottom - top);
      if (area < pickedArea) {
        picked = loop;
        pickedArea = area;
      }
    }

    if (!picked) return;

    const clientNodeId = loopClientNodeId(picked);
    if (!clientNodeId) return;

    const next = new Map(extraLoopNodeIdsByClientNodeId);
    const set = new Set(next.get(clientNodeId) ?? []);
    if (set.has(createdId)) return;
    set.add(createdId);
    next.set(clientNodeId, set);
    extraLoopNodeIdsByClientNodeId = next;

    recomputeLoopHighlightSets();
    requestFramesUpdate();
  };

  const requestFramesUpdate = () => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (loopFramesRaf) return;
    loopFramesRaf = requestAnimationFrame(() => {
      loopFramesRaf = 0;
      computeLoopFrames();
    });
  };

  const toggleLoopLogs = (loop: LocalLoop) => {
    const clientId = loopActions.getLoopClientId(loop);
    if (!clientId) return;
    if (get(showExecutorLogs) && get(logsClientId) === clientId) {
      showExecutorLogs.set(false);
      return;
    }
    logsClientId.set(clientId);
    showExecutorLogs.set(true);
  };

  const loopHasDisabledNodesForLoop = (loop: LocalLoop) => loopHasDisabledNodes(loop, opts.getGroupDisabledNodeIds());

  loopsUnsub = opts.nodeEngine.localLoops.subscribe((loops) => {
    const nextLoops = Array.isArray(loops) ? loops : [];
    const prevLoopIds = new Set(get(localLoops).map((l) => l.id));
    const addedLoops = nextLoops.filter((l) => !prevLoopIds.has(l.id));

    const nextIds = new Set(nextLoops.map((l) => l.id));
    const vanished = get(localLoops).filter((l) => !nextIds.has(l.id));

    for (const loop of vanished) {
      const loopId = loop.id;
      const pending = deployPendingByLoopId.get(loopId);
      if (pending) loopActions.clearLoopDeployPending(loopId);

      const knownClientId = deployedLoopClientIdByLoopId.get(loopId) ?? pending?.clientId ?? '';
      if (!knownClientId) continue;

      const hadDeployment = deployedLoopClientIdByLoopId.has(loopId) || Boolean(pending);
      if (!hadDeployment) continue;

      loopActions.stopAndRemoveLoopById(loopId, knownClientId);
      const next = new Map(deployedLoopClientIdByLoopId);
      next.delete(loopId);
      deployedLoopClientIdByLoopId = next;
      opts.onLoopVanished(loopId, knownClientId);
    }

    localLoops.set(nextLoops);
    recomputeLoopHighlightSets();
    requestFramesUpdate();

    if (addedLoops.length > 0) {
      for (const loop of addedLoops) {
        opts.onLoopFrameReady(loop);
      }
    }
  });

  deployedLoopsUnsub = opts.nodeEngine.deployedLoops.subscribe((ids) => {
    deployedLoopIds.set(new Set(Array.isArray(ids) ? ids : []));
    recomputeLoopHighlightSets();
    requestFramesUpdate();
  });

  sensorUnsub = sensorData.subscribe((map) => {
    for (const [clientId, msg] of map.entries()) {
      const m = msg as Record<string, unknown>;
      if (!m || m.sensorType !== 'custom') continue;
      const payload = (m.payload ?? {}) as Record<string, unknown>;
      if (payload?.kind !== 'node-executor') continue;

      const serverTs = Number(m.serverTimestamp ?? 0);
      if (!Number.isFinite(serverTs) || serverTs <= 0) continue;
      if (executorLastServerTimestampByClient.get(clientId) === serverTs) continue;
      executorLastServerTimestampByClient.set(clientId, serverTs);

      const event = typeof payload.event === 'string' ? payload.event : 'unknown';
      const loopId = typeof payload.loopId === 'string' ? payload.loopId : null;
      const error = payload.error ? String(payload.error) : null;

      executorStatusByClient.set(
        updateExecutorStatus(get(executorStatusByClient), clientId, {
          at: serverTs,
          event,
          loopId,
          error,
          payload: payload as Record<string, unknown>,
        })
      );

      if (loopId && event === 'removed') {
        const next = new Map(deployedLoopClientIdByLoopId);
        next.delete(loopId);
        deployedLoopClientIdByLoopId = next;
      }

      if (!loopId) continue;
      const pending = deployPendingByLoopId.get(loopId);
      if (!pending) continue;
      if (pending.clientId !== clientId) continue;

      if (event === 'deployed') {
        opts.nodeEngine.markLoopDeployed(loopId, true);
        const next = new Map(deployedLoopClientIdByLoopId);
        next.set(loopId, clientId);
        deployedLoopClientIdByLoopId = next;
        loopActions.clearLoopDeployPending(loopId);
        continue;
      }

      if (event === 'rejected' || event === 'error') {
        loopActions.clearLoopDeployPending(loopId);
        opts.onDeployError(error ?? event);
      }
    }
  });

  return {
    localLoops,
    deployedLoopIds,
    loopFrames,
    executorStatusByClient,
    showExecutorLogs,
    logsClientId,
    deployedNodeIds,
    deployedConnIds,
    localLoopConnIds,
    loopActions,
    isLoopDeploying: loopActions.isLoopDeploying,
    loopHasDisabledNodes: loopHasDisabledNodesForLoop,
    toggleLoopLogs,
    getEffectiveLoops,
    autoAddNodeToLoopFromConnectDrop,
    requestFramesUpdate,
    applyHighlights,
    scheduleHighlight,
    destroy: () => {
      loopsUnsub?.();
      deployedLoopsUnsub?.();
      sensorUnsub?.();
      for (const entry of deployPendingByLoopId.values()) {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
      }
      if (loopFramesRaf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(loopFramesRaf);
      loopFramesRaf = 0;
    },
  };
}
