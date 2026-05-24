// Purpose: Regression tests for NodeCanvas picker node-add side effects.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handlePickerNodeAdded } from './picker-node-added';

test('picker-added nodes are selected and refreshed without scheduling viewport focus', () => {
  const calls: string[] = [];

  handlePickerNodeAdded('node-1', {
    setSelectedNode: (nodeId) => calls.push(`select:${nodeId}`),
    requestFramesUpdate: () => calls.push('frames'),
    requestMinimapUpdate: () => calls.push('minimap'),
    setPendingFocusNodeIds: (nodeIds) => calls.push(`focus:${nodeIds.join(',')}`),
  });

  assert.deepEqual(calls, ['select:node-1', 'frames', 'minimap']);
});
