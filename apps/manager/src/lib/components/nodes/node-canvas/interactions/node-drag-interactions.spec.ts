// Purpose: Regression tests for NodeCanvas node pointer drag interactions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNodeDragInteractions } from './node-drag-interactions';

function createPointerDownTarget(nodeId: string, options: { onSocket?: boolean } = {}) {
  const nodeEl = { dataset: { reteNodeId: nodeId } };
  const socketEl = {};
  return {
    isContentEditable: false,
    closest(selector: string) {
      if (selector === '.node') return nodeEl;
      if (selector === '.socket' && options.onSocket) return socketEl;
      return null;
    },
  };
}

function createInteractions(calls: string[]) {
  return createNodeDragInteractions({
    windowRef: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window,
    getSelectedGroupIdStore: () => ({ set: (value) => calls.push(`group:${value ?? ''}`) }),
    getGroupFrames: () => [],
    getNodeEngine: () => ({
      getNode: (nodeId) => ({
        id: nodeId,
        type: 'group-proxy',
        position: { x: 0, y: 0 },
        config: { groupId: 'group-1', direction: 'input' },
        inputValues: {},
        outputValues: {},
      }),
      updateNodePosition: () => undefined,
      updateNodeConfig: () => undefined,
    }),
    getViewAdapter: () => ({
      getNodePosition: () => ({ x: 0, y: 0 }),
      setNodePosition: () => undefined,
    }),
    getGroupController: () => ({
      clearSelection: () => calls.push('clear-group-selection'),
      handleDroppedNodesAfterDrag: () => undefined,
      onPointerDown: () => calls.push('group-pointer-down'),
    }),
    getGroupPortNodesController: () => ({ scheduleAlign: () => undefined }),
    computeGraphPosition: (clientX, clientY) => ({ x: clientX, y: clientY }),
    generateId: () => 'new-node',
    addNode: () => undefined,
    setSelectedNode: (nodeId) => calls.push(`select:${nodeId}`),
  });
}

function dispatchPointerDown(
  interactions: ReturnType<typeof createNodeDragInteractions>,
  target: ReturnType<typeof createPointerDownTarget>,
  calls: string[]
) {
  interactions.handlePointerDown({
    target,
    button: 0,
    altKey: false,
    pointerId: 1,
    clientX: 12,
    clientY: 24,
    preventDefault: () => calls.push('prevent'),
    stopPropagation: () => calls.push('stop'),
  } as unknown as PointerEvent);
}

test('clicking a group-proxy node body selects it for keyboard deletion', () => {
  const calls: string[] = [];
  const interactions = createInteractions(calls);

  dispatchPointerDown(interactions, createPointerDownTarget('proxy-1'), calls);

  assert.deepEqual(calls, ['group:', 'clear-group-selection', 'select:proxy-1']);
});

test('clicking the visible group-proxy socket selects it without blocking socket drag handling', () => {
  const calls: string[] = [];
  const interactions = createInteractions(calls);

  dispatchPointerDown(interactions, createPointerDownTarget('proxy-1', { onSocket: true }), calls);

  assert.deepEqual(calls, [
    'group:',
    'clear-group-selection',
    'select:proxy-1',
    'group-pointer-down',
  ]);
});
