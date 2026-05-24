// Purpose: Regression tests for NodeCanvas selection cleanup timing.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldClearMissingSelectedNode } from './selection-controller';

test('shouldClearMissingSelectedNode keeps a selected node while graph state is catching up', () => {
  assert.equal(
    shouldClearMissingSelectedNode({
      selectedNodeId: 'mother-1',
      graphNodeIds: [],
      nodeMapIds: ['mother-1'],
    }),
    false
  );
});

test('shouldClearMissingSelectedNode clears selection after node disappears from graph and view', () => {
  assert.equal(
    shouldClearMissingSelectedNode({
      selectedNodeId: 'mother-1',
      graphNodeIds: [],
      nodeMapIds: [],
    }),
    true
  );
});
