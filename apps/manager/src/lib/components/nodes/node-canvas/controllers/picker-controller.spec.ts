// Purpose: Regression tests for node picker semantic connection creation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readable } from 'svelte/store';

import { createPickerController } from './picker-controller';

function createHarness() {
  const addedConnections: unknown[] = [];
  const addedNodes: unknown[] = [];
  const controller = createPickerController({
    nodeRegistry: {
      list: () => [],
    } as never,
    getContainer: () =>
      ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      }) as HTMLDivElement,
    computeGraphPosition: () => ({ x: 10, y: 20 }),
    getLastPointerClient: () => ({ x: 100, y: 100 }),
    getPortDefForSocket: (socket) =>
      socket.nodeId.startsWith('view:')
        ? null
        : ({ id: socket.key, label: socket.key, type: 'number' } as never),
    bestMatchingPort: () => null,
    addNode: () => 'new-node',
    onNodeAdded: (nodeId, item) => {
      addedNodes.push({ nodeId, type: item.type });
    },
    addConnection: (connection) => {
      addedConnections.push(connection);
    },
    graphStateStore: readable({ nodes: [], connections: [] }),
  });

  return { controller, addedConnections, addedNodes };
}

test('connect picker never creates a semantic connection when the initial socket is editor-only', () => {
  const { controller, addedConnections } = createHarness();

  controller.openPicker({
    clientX: 100,
    clientY: 120,
    mode: 'connect',
    initialSocket: { nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' },
  });
  controller.handlePick({
    type: 'number',
    label: 'Number',
    category: 'Values',
    matchPort: { id: 'value', label: 'Value', side: 'input', type: 'number' },
  });

  assert.deepEqual(addedConnections, []);
});

test('picker reports successfully added nodes so the canvas can select them', () => {
  const { controller, addedNodes } = createHarness();

  controller.openPicker({ clientX: 100, clientY: 120, mode: 'add' });
  controller.handlePick({
    type: 'display-object',
    label: 'Display',
    category: 'Objects',
  });

  assert.deepEqual(addedNodes, [{ nodeId: 'new-node', type: 'display-object' }]);
});
