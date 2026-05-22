// Purpose: Regression tests for Custom Node UI handlers that must not leak view-only state into runtime.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createCustomNodeHandlers } from './custom-node-handlers';

test('expanded custom node frame Active is view-only and does not mutate the semantic node', () => {
  const config = {
    customNode: {
      definitionId: 'def-1',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [], connections: [] },
    },
  };
  const updates: string[] = [];

  const handlers = createCustomNodeHandlers({
    groupController: {
      nodeGroups: writable([]),
      toggleGroupDisabled: () => updates.push('toggleGroupDisabled'),
      renameGroup: () => undefined,
    },
    nodeEngine: {
      getNode: () => ({
        id: 'custom-1',
        type: 'custom:def-1',
        config,
        inputValues: { gate: true },
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeConfig: () => updates.push('updateNodeConfig'),
      updateNodeInputValue: () => updates.push('updateNodeInputValue'),
    },
    expandedCustomByGroupId: new Map([['group-1', { groupId: 'group-1', nodeId: 'custom-1' }]]),
    readCustomNodeState: (nodeConfig) => nodeConfig.customNode as never,
    writeCustomNodeState: (nodeConfig, state) => ({ ...nodeConfig, customNode: state }),
    getCustomNodeDefinition: () => null,
    upsertCustomNodeDefinition: () => undefined,
    getCustomNodeActions: () => null,
  });

  handlers.handleToggleGroupDisabled('group-1');

  assert.deepEqual(updates, []);
});
