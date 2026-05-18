/**
 * Purpose: Patch deployment + runtime override orchestration for NodeCanvas (manager-only runtime layer).
 */

import { get } from 'svelte/store';
import {
  resolvePatchDeploymentPlan as resolvePatchDeploymentPlanCore,
  type PatchDeploymentPlan,
} from './patch-deployment-plan';
import {
  applyTimeRangePlayheadsToPatchPayload,
  computeTopologySignature,
  isDefinitionBypassableWhenDisabled,
} from './patch-runtime-helpers';
import { resolveDeployedLoopClientId, selectExecutorLogsTargetId } from './patch-override-routing';
import { createPatchMidiBridge } from './patch-midi-bridge';
import type {
  CreatePatchRuntimeOptions,
  DeployedPatch,
  PatchPayload,
  PatchRuntime,
  SendNodeOverrideFn,
} from './patch-runtime-types';

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

const managedClientGroupTarget = (clientId: string) => ({
  mode: 'group' as const,
  groupId: `client:${clientId}`,
});
export type {
  CreatePatchRuntimeOptions,
  PatchRuntime,
  SendNodeOverrideFn,
} from './patch-runtime-types';

export function createPatchRuntime(opts: CreatePatchRuntimeOptions): PatchRuntime {
  const {
    nodeEngine,
    nodeRegistry,
    adapter,
    isRunningStore,
    getGraphState,
    groupDisabledNodeIds,
    executorStatusByClient,
    showExecutorLogs,
    logsClientId,
    loopController,
    managerState,
    displayTransport,
    getSDK,
    ensureDisplayLocalFilesRegisteredFromValue,
  } = opts;

  const OVERRIDE_TTL_MS = 1500;
  const PATCH_RUNTIME_TARGETS_CHECK_INTERVAL_MS = 200;
  const LOCAL_DISPLAY_TARGET_ID = 'local:display';

  const clientIdsInOrder = () =>
    (get(managerState).clients ?? [])
      .filter((client) => {
        const record = asRecord(client);
        return record?.connected !== false;
      })
      .map((client) => {
        const record = asRecord(client);
        return record ? String(record.clientId ?? '') : '';
      })
      .filter(Boolean);

  const audienceClientIdsInOrder = () =>
    (get(managerState).clients ?? [])
      .filter((client) => {
        const record = asRecord(client);
        return record?.connected !== false && String(record?.group ?? '') !== 'display';
      })
      .map((client) => {
        const record = asRecord(client);
        return record ? String(record.clientId ?? '') : '';
      })
      .filter(Boolean);

  const isLocalDisplayTarget = (id: string): boolean => id === LOCAL_DISPLAY_TARGET_ID;

  const isDisplayTarget = (id: string): boolean => {
    if (isLocalDisplayTarget(id)) return true;
    const clients = get(managerState).clients ?? [];
    return clients.some((client) => {
      const record = asRecord(client);
      if (!record) return false;
      return String(record.clientId ?? '') === id && String(record.group ?? '') === 'display';
    });
  };

  let patchPendingCommitByKey = new Map<string, ReturnType<typeof setTimeout>>();
  let deployedPatchByClientId = new Map<string, DeployedPatch>();
  let patchDeployTimer: ReturnType<typeof setTimeout> | null = null;
  let patchLastPlanKey = '';
  let patchRuntimeTargetsLastCheckAt = 0;

  // ────────────────────────────────────────────────────────────────────────────
  // node-executor control transport
  // ────────────────────────────────────────────────────────────────────────────

  const sendNodeExecutorPluginControl = (targetId: string, command: string, payload: unknown) => {
    const id = String(targetId ?? '');
    if (!id) return;
    const payloadRecord = asRecord(payload) ?? {};

    // Display-only nodes can reference `displayfile:<id>` (browser-local File) that must be registered on Display
    // before node-executor starts playback. This works in paired mode (MessagePort) and same-origin fallback mode
    // (BroadcastChannel), so we always pre-register for display targets.
    if ((command === 'deploy' || command === 'override-set') && isDisplayTarget(id)) {
      ensureDisplayLocalFilesRegisteredFromValue(payload);
    }

    if (isLocalDisplayTarget(id)) {
      displayTransport.sendPlugin('node-executor', command, payloadRecord, { localOnly: true });
      return;
    }

    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendPluginControl(managedClientGroupTarget(id), 'node-executor', command, payload);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Visual state helpers
  // ────────────────────────────────────────────────────────────────────────────

  const getDeployedPatchNodeIds = (): Set<string> => {
    const out = new Set<string>();
    for (const patch of deployedPatchByClientId.values()) {
      for (const id of patch.nodeIds) out.add(id);
    }
    return out;
  };

  const applyStoppedHighlights = async (running: boolean) => {
    const stopped = !running;
    const state = getGraphState();
    for (const node of state.nodes ?? []) {
      const id = String(node.id ?? '');
      if (!id) continue;
      const prev = adapter.getNodeVisualState(id);
      if (Boolean(prev?.stopped) !== stopped) await adapter.setNodeVisualState(id, { stopped });
    }
  };

  const applyPatchHighlights = async (patchNodeIds: Set<string>) => {
    const ids = patchNodeIds ?? new Set<string>();
    const state = getGraphState();
    for (const node of state.nodes ?? []) {
      const id = String(node.id ?? '');
      if (!id) continue;
      const deployedPatch = ids.has(id);
      const prev = adapter.getNodeVisualState(id);
      if (Boolean(prev?.deployedPatch) !== deployedPatch) {
        await adapter.setNodeVisualState(id, { deployedPatch });
      }
    }
  };

  const syncPatchOffloadState = (patchNodeIds: Set<string>) => {
    nodeEngine.setPatchOffloadedNodeIds(Array.from(patchNodeIds ?? []));
  };

  const syncPatchVisualState = () => {
    const nodeIds = getDeployedPatchNodeIds();
    syncPatchOffloadState(nodeIds);
    void applyPatchHighlights(nodeIds);
  };

  const midiBridge = createPatchMidiBridge({
    isRunningStore,
    getGraphState,
    nodeRegistry,
    nodeEngine,
    loopController,
    getDeployedPatches: () => deployedPatchByClientId.entries(),
    sendNodeExecutorPluginControl,
  });
  const clearMidiLoopBridgeState = () => midiBridge.clearLoopState();

  // ────────────────────────────────────────────────────────────────────────────
  // Patch deployment
  // ────────────────────────────────────────────────────────────────────────────

  const isBypassableWhenDisabled = (nodeId: string): boolean => {
    const node = nodeEngine.getNode(String(nodeId));
    if (!node) return false;

    const def = nodeRegistry.get(String(node.type));
    return isDefinitionBypassableWhenDisabled(def);
  };

  const resolvePatchDeploymentPlan = (): PatchDeploymentPlan | null => {
    return resolvePatchDeploymentPlanCore({
      graph: getGraphState(),
      disabledNodeIds: get(groupDisabledNodeIds),
      clientIdsInOrder,
      audienceClientIdsInOrder,
      getManagerClients: () => get(managerState).clients ?? [],
      localDisplayTargetId: LOCAL_DISPLAY_TARGET_ID,
      getDisplayAvailability: () => displayTransport.getAvailability(),
      getNodeDefinition: (type) => nodeRegistry.get(type),
      getRuntimeNode: (nodeId) => nodeEngine.getNode(nodeId),
      getLastComputedInputs: (nodeId) => nodeEngine.getLastComputedInputs(nodeId),
      getLastError: () => get(nodeEngine.lastError),
      setLastError: (message) => nodeEngine.lastError.set(message),
    });
  };

  const resolvePatchTargetClientIds = (): string[] =>
    resolvePatchDeploymentPlan()?.targetClientIds ?? [];

  const stopAndRemovePatchOnClient = (clientId: string, patchId: string) => {
    const id = String(clientId ?? '');
    const loopId = String(patchId ?? '');
    if (!id || !loopId) return;
    sendNodeExecutorPluginControl(id, 'stop', { loopId });
    sendNodeExecutorPluginControl(id, 'remove', { loopId });
  };

  const stopAllDeployedPatches = () => {
    for (const [clientId, patch] of deployedPatchByClientId.entries()) {
      stopAndRemovePatchOnClient(clientId, patch.patchId);
    }
    deployedPatchByClientId = new Map();
    patchLastPlanKey = '';
    midiBridge.resetPatchOverrides();
    syncPatchOffloadState(new Set());
    void applyPatchHighlights(new Set());
  };

  const reconcilePatchDeployment = (reason: string) => {
    if (!get(isRunningStore)) {
      stopAllDeployedPatches();
      return;
    }

    if (!getSDK()) return;

    const plan = resolvePatchDeploymentPlan();
    patchLastPlanKey = plan?.planKey ?? '';
    if (!plan || plan.targetClientIds.length === 0) {
      if (deployedPatchByClientId.size > 0) stopAllDeployedPatches();
      return;
    }

    const localOnlyNodeTypes = new Set([
      'load-audio-from-local',
      'load-image-from-local',
      'load-video-from-local',
    ]);
    const disabled = get(groupDisabledNodeIds);
    const statusMap = get(executorStatusByClient);

    const desiredByClientId = new Map<
      string,
      {
        patchId: string;
        nodeIds: Set<string>;
        topologySignature: string;
        targetRevision: string;
        payload: PatchPayload;
      }
    >();
    const desiredNodeIds = new Set<string>();
    const retainedClientIds = new Set<string>();

    const groupsByRootKey = new Map<string, { rootIds: string[]; clientIds: string[] }>();
    for (const [clientId, rootIds] of plan.rootIdsByClientId.entries()) {
      const key = rootIds.join('|');
      const group = groupsByRootKey.get(key) ?? { rootIds, clientIds: [] };
      group.clientIds.push(String(clientId));
      groupsByRootKey.set(key, group);
    }

    for (const group of groupsByRootKey.values()) {
      let payload: PatchPayload;
      try {
        payload = nodeEngine.exportGraphForPatchFromRootNodeIds(group.rootIds);
      } catch (err) {
        nodeEngine.lastError.set(err instanceof Error ? err.message : 'Export patch failed');
        for (const clientId of group.clientIds) retainedClientIds.add(String(clientId));
        continue;
      }

      let targets = group.clientIds.slice();
      const applyLocalOnlyTargetFilter = () => {
        const isLocalOnlyPatch = (payload?.graph?.nodes ?? []).some((node) =>
          localOnlyNodeTypes.has(String(node?.type ?? ''))
        );
        if (!isLocalOnlyPatch) return true;

        const displayTargets = targets.filter((id) => isDisplayTarget(id));
        if (displayTargets.length === 0) {
          nodeEngine.lastError.set(
            'Load * From Local(Display only) requires a Display target (connect Deploy to Display).'
          );
          return false;
        }
        targets = displayTargets;
        return true;
      };

      if (!applyLocalOnlyTargetFilter() || targets.length === 0) continue;

      let nodeIds = new Set((payload?.graph?.nodes ?? []).map((node) => String(node.id)));
      let hasDisabledNodes = Array.from(nodeIds).some((id) => disabled.has(id));

      // Disabled nodes do not exist on the client runtime; drop roots that include disabled nodes so other roots can
      // still deploy and run.
      if (hasDisabledNodes && group.rootIds.length > 1) {
        const enabledRoots: string[] = [];
        for (const rootId of group.rootIds) {
          try {
            const rootPayload = nodeEngine.exportGraphForPatchFromRootNodeIds([rootId]);
            const rootNodeIds = new Set(
              (rootPayload?.graph?.nodes ?? []).map((node) => String(node.id))
            );
            const rootHasDisabled = Array.from(rootNodeIds).some((id) => disabled.has(id));
            if (!rootHasDisabled) enabledRoots.push(rootId);
          } catch {
            // ignore roots that fail to export
          }
        }

        if (enabledRoots.length === 0) {
          nodeEngine.lastError.set(
            'Patch contains disabled nodes; enable them or remove from deploy.'
          );
          continue;
        }

        try {
          payload = nodeEngine.exportGraphForPatchFromRootNodeIds(enabledRoots);
        } catch (err) {
          nodeEngine.lastError.set(err instanceof Error ? err.message : 'Export patch failed');
          continue;
        }

        targets = group.clientIds.slice();
        if (!applyLocalOnlyTargetFilter() || targets.length === 0) continue;

        nodeIds = new Set((payload?.graph?.nodes ?? []).map((node) => String(node.id)));
        hasDisabledNodes = Array.from(nodeIds).some((id) => disabled.has(id));
      }

      if (hasDisabledNodes) {
        nodeEngine.lastError.set(
          'Patch contains disabled nodes; enable them or remove from deploy.'
        );
        continue;
      }

      const topologySignature = computeTopologySignature(payload.graph);
      const patchId = String(payload?.meta?.loopId ?? '');

      applyTimeRangePlayheadsToPatchPayload(payload, (nodeId) =>
        nodeEngine.getTimeRangePlayheadSec(nodeId)
      );

      for (const nodeId of nodeIds) desiredNodeIds.add(nodeId);
      for (const clientId of targets) {
        const targetKey = String(clientId);
        desiredByClientId.set(targetKey, {
          patchId,
          nodeIds,
          topologySignature,
          targetRevision: plan.targetRevisionByClientId.get(targetKey) ?? '',
          payload,
        });
      }
    }

    for (const clientId of retainedClientIds) {
      const deployed = deployedPatchByClientId.get(clientId);
      if (!deployed) continue;
      for (const nodeId of deployed.nodeIds) desiredNodeIds.add(nodeId);
    }

    if (desiredByClientId.size === 0) {
      if (retainedClientIds.size === 0) {
        if (deployedPatchByClientId.size > 0) stopAllDeployedPatches();
      } else {
        syncPatchOffloadState(desiredNodeIds);
        void applyPatchHighlights(desiredNodeIds);
        const first = deployedPatchByClientId.values().next().value as DeployedPatch | undefined;
        if (first) midiBridge.syncPatchRoutes(first.patchId, desiredNodeIds);
      }
      return;
    }

    // Stop/remove patches on clients that are no longer targeted.
    for (const [clientId, patch] of deployedPatchByClientId.entries()) {
      if (desiredByClientId.has(clientId) || retainedClientIds.has(clientId)) continue;
      stopAndRemovePatchOnClient(clientId, patch.patchId);
      deployedPatchByClientId.delete(clientId);
    }

    let didDeploy = false;
    for (const [clientId, desired] of desiredByClientId.entries()) {
      const deployed = deployedPatchByClientId.get(clientId) ?? null;
      const status = statusMap.get(clientId) ?? null;
      const statusLoopId = status?.loopId ? String(status.loopId) : '';
      const statusRunning = status?.running === false;

      const needDeploy =
        !deployed ||
        deployed.patchId !== desired.patchId ||
        deployed.topologySignature !== desired.topologySignature ||
        deployed.targetRevision !== desired.targetRevision ||
        (statusLoopId && statusLoopId !== desired.patchId);

      if (!needDeploy) {
        // Best-effort: if the patch is targeted but was stopped on the client, restart it.
        if (statusLoopId === desired.patchId && statusRunning) {
          sendNodeExecutorPluginControl(String(clientId), 'start', { loopId: desired.patchId });
        }

        // Keep nodeId membership up to date for per-node override routing.
        deployedPatchByClientId.set(String(clientId), {
          patchId: desired.patchId,
          nodeIds: desired.nodeIds,
          topologySignature: desired.topologySignature,
          targetRevision: desired.targetRevision,
          deployedAt: deployed?.deployedAt ?? Date.now(),
        });
        continue;
      }

      if (!didDeploy) {
        // A deploy resets client overrides; ensure MIDI bridge resend starts fresh.
        midiBridge.resetPatchOverrides();
        didDeploy = true;
      }

      sendNodeExecutorPluginControl(String(clientId), 'deploy', desired.payload);
      sendNodeExecutorPluginControl(String(clientId), 'start', { loopId: desired.patchId });

      deployedPatchByClientId.set(String(clientId), {
        patchId: desired.patchId,
        nodeIds: desired.nodeIds,
        topologySignature: desired.topologySignature,
        targetRevision: desired.targetRevision,
        deployedAt: Date.now(),
      });
    }

    // MIDI wiring is manager-only; keep bridge routes in sync even when the deploy graph is unchanged.
    const first = deployedPatchByClientId.values().next().value as DeployedPatch | undefined;
    syncPatchOffloadState(desiredNodeIds);
    void applyPatchHighlights(desiredNodeIds);
    if (first) midiBridge.syncPatchRoutes(first.patchId, desiredNodeIds);
    console.log('[patch] reconciled', {
      reason,
      targets: Array.from(desiredByClientId.keys()).sort(),
    });
  };

  const scheduleReconcile = (reason: string) => {
    if (patchDeployTimer) clearTimeout(patchDeployTimer);
    patchDeployTimer = setTimeout(() => {
      patchDeployTimer = null;
      reconcilePatchDeployment(reason);
    }, 320);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Override routing (loop + patch)
  // ────────────────────────────────────────────────────────────────────────────

  const sendNodeOverride: SendNodeOverrideFn = (nodeId, kind, portId, value) => {
    if (!nodeId || !portId) return;

    const state = getGraphState();
    const node = (state.nodes ?? []).find((n) => String(n.id) === String(nodeId));
    if (
      node &&
      String(node.type ?? '') === 'client-object' &&
      kind === 'config' &&
      portId === 'clientId'
    )
      return;

    const loop = loopController?.loopActions.getDeployedLoopForNode(nodeId);
    if (loop) {
      const loopId = String(loop?.id ?? '');
      // Important: once a loop is deployed, the executor client is the "source of truth" for where to send overrides.
      // Using the current `client-object.config.clientId` is incorrect because Index/Range changes can retarget the
      // picker selection without redeploying the loop.
      const deployedClientId = resolveDeployedLoopClientId(get(executorStatusByClient), loopId);

      const clientId = deployedClientId || loopController?.loopActions.getLoopClientId(loop);
      if (!clientId) return;

      sendNodeExecutorPluginControl(clientId, 'override-set', {
        loopId,
        overrides: [{ nodeId, kind, portId, value, ttlMs: OVERRIDE_TTL_MS }],
      });

      // Commit: persist the latest value after inactivity (debounced).
      const key = `${clientId}|${loopId}|${nodeId}|${kind}|${portId}`;
      const existing = patchPendingCommitByKey.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        patchPendingCommitByKey.delete(key);
        sendNodeExecutorPluginControl(clientId, 'override-set', {
          loopId,
          overrides: [{ nodeId, kind, portId, value }],
        });
      }, 420);
      patchPendingCommitByKey.set(key, timer);
      return;
    }

    const nodeKey = String(nodeId);
    const patchTargets: { clientId: string; patch: DeployedPatch }[] = [];
    for (const [clientId, patch] of deployedPatchByClientId.entries()) {
      if (patch.nodeIds.has(nodeKey)) patchTargets.push({ clientId, patch });
    }
    if (patchTargets.length === 0) return;

    for (const target of patchTargets) {
      sendNodeExecutorPluginControl(String(target.clientId), 'override-set', {
        loopId: target.patch.patchId,
        overrides: [{ nodeId, kind, portId, value, ttlMs: OVERRIDE_TTL_MS }],
      });

      const key = `${target.clientId}|${target.patch.patchId}|${nodeId}|${kind}|${portId}`;
      const existing = patchPendingCommitByKey.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        patchPendingCommitByKey.delete(key);
        sendNodeExecutorPluginControl(String(target.clientId), 'override-set', {
          loopId: target.patch.patchId,
          overrides: [{ nodeId, kind, portId, value }],
        });
      }, 420);
      patchPendingCommitByKey.set(key, timer);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // UI hooks
  // ────────────────────────────────────────────────────────────────────────────

  const toggleExecutorLogs = () => {
    const show = get(showExecutorLogs);
    const current = get(logsClientId);
    const patchTargets = resolvePatchTargetClientIds();
    const selected = (get(managerState).selectedClientIds ?? []).map(String).filter(Boolean);
    const targetId = selectExecutorLogsTargetId(patchTargets, selected, clientIdsInOrder());
    if (!targetId) return;

    if (show && current === targetId) {
      showExecutorLogs.set(false);
      return;
    }
    logsClientId.set(targetId);
    showExecutorLogs.set(true);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle + event handlers
  // ────────────────────────────────────────────────────────────────────────────

  const onTick = () => {
    midiBridge.sendPatchOverrides();
    midiBridge.sendLoopOverrides();

    if (!get(isRunningStore)) return;
    if (patchDeployTimer) return;
    const now = Date.now();
    if (now - patchRuntimeTargetsLastCheckAt < PATCH_RUNTIME_TARGETS_CHECK_INTERVAL_MS) return;
    patchRuntimeTargetsLastCheckAt = now;

    const planKey = resolvePatchDeploymentPlan()?.planKey ?? '';
    if (planKey !== patchLastPlanKey) scheduleReconcile('runtime-target-change');
  };

  const onGraphStateChanged = () => {
    scheduleReconcile('graph-change');
    midiBridge.markLoopDirty();

    // Keep MIDI bridge wiring responsive (MIDI nodes are excluded from deploy topology).
    const first = deployedPatchByClientId.values().next().value as DeployedPatch | undefined;
    if (first) midiBridge.syncPatchRoutes(first.patchId, getDeployedPatchNodeIds());
  };

  const onLoopDeployListChanged = () => {
    // Loop deploy/redeploy clears client runtime overrides; force resend of MIDI-driven overrides.
    midiBridge.resetLoopOverrides();
  };

  const onGroupDisabledChanged = (disabled: Set<string>) => {
    let didStop = false;
    for (const [clientId, patch] of deployedPatchByClientId.entries()) {
      const disabledInPatch = Array.from(patch.nodeIds).filter((id) => disabled.has(id));
      // Avoid hard-stopping patches when the disabled nodes can be bypassed on the next reconcile.
      // This prevents audible restarts when toggling audio FX groups (e.g. Tone Delay).
      const shouldStop =
        disabledInPatch.length > 0 && !disabledInPatch.every((id) => isBypassableWhenDisabled(id));
      if (!shouldStop) continue;

      stopAndRemovePatchOnClient(clientId, patch.patchId);
      deployedPatchByClientId.delete(clientId);
      midiBridge.removePatchClient(clientId, patch.patchId);
      didStop = true;
    }

    if (didStop) syncPatchVisualState();
    scheduleReconcile('group-gate');
  };

  const onRunningChanged = (running: boolean) => {
    void applyStoppedHighlights(Boolean(running));
    if (!running) {
      stopAllDeployedPatches();
      clearMidiLoopBridgeState();
    }
  };

  const destroy = () => {
    if (patchDeployTimer) clearTimeout(patchDeployTimer);
    for (const timer of patchPendingCommitByKey.values()) clearTimeout(timer);
    patchPendingCommitByKey.clear();
    stopAllDeployedPatches();
    clearMidiLoopBridgeState();
  };

  return {
    onTick,
    onGraphStateChanged,
    onLoopDeployListChanged,
    onGroupDisabledChanged,
    onRunningChanged,
    scheduleReconcile,
    stopAllDeployedPatches,
    clearMidiLoopBridgeState,
    syncPatchVisualState,
    applyStoppedHighlights,
    toggleExecutorLogs,
    sendNodeOverride,
    destroy,
  };
}
