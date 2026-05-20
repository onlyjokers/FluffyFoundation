// Purpose: Bind NodeCanvas store subscriptions outside the Svelte component shell.
import { get } from 'svelte/store';
import { asRecord, getBoolean, getString } from '$lib/utils/value-guards';
import { midiService } from '$lib/features/midi/midi-service';
import {
  groupSnapshotKey,
  normalizeGroupsForSnapshot,
} from '../groups/group-snapshot';

export function bindRuntimeSubscriptions(opts: {
  nodeEngine: any;
  isRunningStore: any;
  deployedLoopIds: any;
  groupController: any;
  groupPortNodesController: any;
  patchRuntime: any;
  loopController: any;
}) {
  const tickUnsub = opts.nodeEngine.tickTime.subscribe(() => {
    opts.groupPortNodesController.updateRuntimeActives();
    opts.patchRuntime.onTick();
  });

  const runningUnsub = opts.isRunningStore.subscribe((running: unknown) => {
    opts.patchRuntime.onRunningChanged(Boolean(running));
    if (!running) {
      opts.loopController?.loopActions.stopAllClientEffects();
      opts.loopController?.loopActions.stopAllDeployedLoops();
    }
  });

  const loopDeployUnsub = opts.deployedLoopIds.subscribe(() => {
    opts.patchRuntime.onLoopDeployListChanged();
  });

  const groupDisabledUnsub = opts.groupController.groupDisabledNodeIds.subscribe(
    (disabled: Set<string>) => {
      opts.patchRuntime.onGroupDisabledChanged(disabled);
    }
  );

  return { tickUnsub, runningUnsub, loopDeployUnsub, groupDisabledUnsub };
}

export function bindGraphStateSubscription(opts: {
  graphStateStore: any;
  graphSync: any;
  groupController: any;
  groupPortNodesController: any;
  patchRuntime: any;
  syncCustomGateInputs: (state: unknown) => void;
  rehydrateExpandedCustomFrames: (state: unknown) => void;
  isApplyingServerSemanticSnapshot?: () => boolean;
}) {
  let lastGraphNodeCount = -1;
  let lastGraphConnKey = '';

  return opts.graphStateStore?.subscribe((state: any) => {
    if ((state.nodes ?? []).some((n: any) => String(n.type).startsWith('midi-'))) {
      void midiService.init();
    }

    const nextNodeCount = state.nodes?.length ?? 0;
    const prevNodeCount = lastGraphNodeCount;
    lastGraphNodeCount = nextNodeCount;

    const nextConnKey = (state.connections ?? []).map((c: any) => String(c.id)).join('|');
    const connectionsChanged = nextConnKey !== lastGraphConnKey;
    lastGraphConnKey = nextConnKey;

    // Only reconcile on node removal to avoid interfering with imports (nodes are added one-by-one).
    if (prevNodeCount >= 0 && nextNodeCount < prevNodeCount) {
      const removedGroupIds = opts.groupController.reconcileGraphNodes(state);
      if (removedGroupIds.length > 0) {
        // Removing group ports triggers another graphState update; skip syncing this stale snapshot.
        const removedPorts =
          opts.groupPortNodesController.removeGroupPortNodesForGroupIds(removedGroupIds);
        if (removedPorts > 0) return;
      }
    }

    opts.graphSync?.schedule(state);
    if (opts.isApplyingServerSemanticSnapshot?.()) return;
    opts.syncCustomGateInputs(state);
    if (connectionsChanged) opts.groupPortNodesController.scheduleNormalizeProxies();
    opts.patchRuntime.onGraphStateChanged();
    opts.rehydrateExpandedCustomFrames(state);
  });
}

export function bindLocalSemanticGraphChangeSubscription(opts: {
  graphChangesStore: any;
  canvasCommands: {
    setNodeParams?: (nodeId: string, params: Record<string, unknown>) => boolean;
    setNodeInputs?: (nodeId: string, inputValues: Record<string, unknown>) => boolean;
  };
  isSyncingGraph: () => boolean;
}) {
  let didReceiveInitialChanges = false;
  return opts.graphChangesStore?.subscribe((changes: unknown[]) => {
    if (!didReceiveInitialChanges) {
      didReceiveInitialChanges = true;
      return;
    }
    if (opts.isSyncingGraph()) return;
    for (const change of changes ?? []) {
      if (!change || typeof change !== 'object') continue;
      const record = change as Record<string, unknown>;
      const nodeId = String(record.nodeId ?? '');
      if (!nodeId) continue;

      if (record.type === 'update-node-config') {
        const config = record.config;
        if (config && typeof config === 'object' && !Array.isArray(config)) {
          opts.canvasCommands.setNodeParams?.(nodeId, config as Record<string, unknown>);
        }
      }

      if (record.type === 'update-node-input-values') {
        const inputValues = record.inputValues;
        if (inputValues && typeof inputValues === 'object' && !Array.isArray(inputValues)) {
          opts.canvasCommands.setNodeInputs?.(nodeId, inputValues as Record<string, unknown>);
        }
      }
    }
  });
}

export function bindGroupUiSubscriptions(opts: {
  nodeGroupsState: any;
  nodeGroups: any;
  groupFrames: any;
  groupController: any;
  groupPortNodesController: any;
}) {
  let syncingGroupsFromProject = false;
  let syncingGroupsToProject = false;
  let lastGroupsKeyFromProject = '';
  let lastGroupsKeyFromCanvas = '';

  const groupUiStateUnsub = opts.nodeGroupsState.subscribe((groups: unknown[]) => {
    if (syncingGroupsToProject) return;
    const nextKey = groupSnapshotKey(groups ?? []);
    if (nextKey === lastGroupsKeyFromProject || nextKey === lastGroupsKeyFromCanvas) return;
    lastGroupsKeyFromProject = nextKey;

    syncingGroupsFromProject = true;
    opts.groupController.setGroups(
      normalizeGroupsForSnapshot(groups as Array<Record<string, unknown>>)
    );
    syncingGroupsFromProject = false;
  });

  const groupNodesUnsub = opts.nodeGroups.subscribe((groups: unknown[]) => {
    const nextKey = groupSnapshotKey(groups ?? []);
    lastGroupsKeyFromCanvas = nextKey;
    if (!syncingGroupsFromProject && nextKey !== lastGroupsKeyFromProject) {
      syncingGroupsToProject = true;
      opts.nodeGroupsState.set(normalizeGroupsForSnapshot(groups as Array<Record<string, unknown>>));
      syncingGroupsToProject = false;
    }
    opts.groupPortNodesController.ensureGroupPortNodes();
    opts.groupPortNodesController.scheduleAlign();
    opts.groupPortNodesController.scheduleNormalizeProxies();
  });

  const groupFramesUnsub = opts.groupFrames.subscribe(() => {
    opts.groupPortNodesController.scheduleAlign();
  });

  return { groupUiStateUnsub, groupNodesUnsub, groupFramesUnsub };
}

export function bindManagerClientSubscription(opts: {
  managerState: any;
  graphStateStore: any;
  graphSync: any;
  nodeEngine: any;
  schedulePatchReconcile: (reason: string) => void;
  syncClientNodesFromInputs: () => void;
}) {
  let lastClientKey = '';

  return opts.managerState.subscribe(($state: any) => {
    const clients = Array.isArray($state.clients) ? $state.clients : [];
    const clientsWithGroups = clients
      .map((client: unknown) => {
        const record = asRecord(client);
        return {
          connected: getBoolean(record.connected, true),
          id: getString(record.clientId, ''),
          group: getString(record.group, ''),
        };
      })
      .filter((c: { connected: boolean }) => c.connected)
      .map(({ id, group }: { id: string; group: string }) => ({ id, group }))
      .filter((c: { id: string }) => Boolean(c.id));

    const audience = clientsWithGroups
      .filter((c: { group: string }) => String(c.group) !== 'display')
      .map((c: { id: string }) => String(c.id));

    const displayIdSet = new Set(
      clientsWithGroups
        .filter((c: { group: string }) => String(c.group) === 'display')
        .map((c: { id: string }) => String(c.id))
    );

    const nextClientKey = clientsWithGroups.map((c: { id: string; group: string }) => `${c.id}:${c.group}`).join('|');
    if (nextClientKey === lastClientKey) return;
    lastClientKey = nextClientKey;

    opts.schedulePatchReconcile('manager-state');
    // Client node titles depend on online client count; refresh labels when client list changes.
    void opts.graphSync?.schedule(get(opts.graphStateStore));

    const engineState = get(opts.graphStateStore);
    // If a project ever ended up with a Display clientId inside a Client node, clear it.
    if (displayIdSet.size > 0) {
      for (const node of engineState.nodes ?? []) {
        if (String(node.type) !== 'client-object') continue;
        const nodeId = String(node.id);
        const nodeInstance = opts.nodeEngine.getNode(nodeId);
        const configuredClientId = getString(asRecord(nodeInstance?.config).clientId, '');
        if (configuredClientId && displayIdSet.has(configuredClientId)) {
          opts.nodeEngine.updateNodeConfig(nodeId, { clientId: '' });
          if (nodeInstance?.outputValues) {
            nodeInstance.outputValues.out = { clientId: '', sensors: null };
            opts.nodeEngine.tickTime.set(Date.now());
          }
        }
      }
    }

    if (audience.length === 0) return;

    opts.syncClientNodesFromInputs();
  });
}

export function bindDisplayBridgeSubscription(opts: {
  displayBridgeState: any;
  schedulePatchReconcile: (reason: string) => void;
}) {
  let lastDisplayBridgeKey = '';

  return opts.displayBridgeState.subscribe((s: any) => {
    const nextKey = `${s.status}|${s.ready ? 1 : 0}`;
    if (nextKey === lastDisplayBridgeKey) return;
    lastDisplayBridgeKey = nextKey;
    opts.schedulePatchReconcile('display-bridge');
  });
}
