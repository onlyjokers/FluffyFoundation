// Purpose: Verify top-level NodeCanvas toolbar actions sync local and server-owned graph state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createCanvasActions } from './canvas-actions';

test('handleClear clears local graph and sends empty graph.replace to server semantic graph', () => {
  let localCleared = false;
  const replaced: unknown[] = [];
  let groupsReset = false;

  const { handleClear } = createCanvasActions({
    nodeEngine: {
      clear: () => {
        localCleared = true;
      },
      start: () => undefined,
      stop: () => undefined,
    } as never,
    replaceGraphCommand: (graph) => {
      replaced.push(graph);
      return true;
    },
    isRunningStore: writable(false),
    getLoopController: () => null,
    groupController: {
      nodeGroups: { set: (value: unknown[]) => { groupsReset = value.length === 0; } },
      groupFrames: { set: () => undefined },
      groupDisabledNodeIds: { set: () => undefined },
      editModeGroupId: { set: () => undefined },
      groupEditToast: { set: () => undefined },
      clearSelection: () => undefined,
      scheduleHighlight: () => undefined,
    } as never,
    getContainer: () => null,
    getNodeCount: () => 0,
    computeGraphPosition: () => ({ x: 0, y: 0 }),
    schedulePatchReconcile: () => undefined,
    stopAllDeployedPatches: () => undefined,
    confirm: () => true,
  });

  handleClear();

  assert.equal(localCleared, true);
  assert.equal(groupsReset, true);
  assert.deepEqual(replaced, [{ nodes: [], connections: [] }]);
});
