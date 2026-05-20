// Purpose: Verify NodeCanvas lifecycle subscriptions bridge local graph edits to server semantic commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { bindGraphStateSubscription, bindLocalSemanticGraphChangeSubscription } from './subscriptions';

test('bindLocalSemanticGraphChangeSubscription forwards local config and input edits', () => {
  const graphChanges = writable<unknown[]>([]);
  const params: unknown[] = [];
  const inputs: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
      setNodeInputs: (nodeId, patch) => {
        inputs.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => false,
  });

  graphChanges.set([
    { type: 'update-node-config', nodeId: 'n1', config: { value: 9 } },
    { type: 'update-node-input-values', nodeId: 'n1', inputValues: { value: 10 } },
  ]);

  unsubscribe?.();
  assert.deepEqual(params, [{ nodeId: 'n1', patch: { value: 9 } }]);
  assert.deepEqual(inputs, [{ nodeId: 'n1', patch: { value: 10 } }]);
});

test('bindLocalSemanticGraphChangeSubscription ignores changes caused by server graph sync', () => {
  const graphChanges = writable<unknown[]>([]);
  const params: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => true,
  });

  graphChanges.set([{ type: 'update-node-config', nodeId: 'n1', config: { value: 9 } }]);

  unsubscribe?.();
  assert.deepEqual(params, []);
});

test('bindLocalSemanticGraphChangeSubscription ignores stale changes replayed on initial subscription', () => {
  const graphChanges = writable<unknown[]>([
    { type: 'update-node-config', nodeId: 'n1', config: { value: 9 } },
  ]);
  const params: unknown[] = [];

  const unsubscribe = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: graphChanges,
    canvasCommands: {
      setNodeParams: (nodeId, patch) => {
        params.push({ nodeId, patch });
        return true;
      },
    },
    isSyncingGraph: () => false,
  });

  assert.deepEqual(params, []);

  graphChanges.set([{ type: 'update-node-config', nodeId: 'n1', config: { value: 10 } }]);

  unsubscribe?.();
  assert.deepEqual(params, [{ nodeId: 'n1', patch: { value: 10 } }]);
});

test('bindGraphStateSubscription syncs the view but suppresses graph-derived writes while server semantic sync is applying', () => {
  const graphState = writable({ nodes: [], connections: [] });
  const graphSyncCalls: unknown[] = [];
  const patchRuntimeCalls: string[] = [];

  const unsubscribe = bindGraphStateSubscription({
    graphStateStore: graphState,
    graphSync: { schedule: (state: unknown) => graphSyncCalls.push(state) },
    groupController: { reconcileGraphNodes: () => [] },
    groupPortNodesController: {
      removeGroupPortNodesForGroupIds: () => 0,
      scheduleNormalizeProxies: () => patchRuntimeCalls.push('normalize'),
    },
    patchRuntime: { onGraphStateChanged: () => patchRuntimeCalls.push('patch') },
    syncCustomGateInputs: () => patchRuntimeCalls.push('gate'),
    rehydrateExpandedCustomFrames: () => patchRuntimeCalls.push('rehydrate'),
    isApplyingServerSemanticSnapshot: () => true,
  });

  graphState.set({
    nodes: [{ id: 'n1', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} }],
    connections: [],
  });

  unsubscribe?.();
  assert.equal(graphSyncCalls.length, 2);
  assert.deepEqual(patchRuntimeCalls, []);
});
