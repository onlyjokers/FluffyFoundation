// Purpose: Regression tests for Rete connection drag/drop isolation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createReteConnectionDropPipe } from './rete-connection-drop-pipe';

function createHarness() {
  const connected: unknown[] = [];
  const openedSockets: unknown[] = [];
  const draggingSockets: unknown[] = [];
  const edgeHighlights: unknown[] = [];

  const pipe = createReteConnectionDropPipe({
    getLastPointerClient: () => ({ x: 100, y: 120 }),
    setConnectDraggingSocket: (socket) => draggingSockets.push(socket),
    setGroupEdgeHighlight: (highlight) => edgeHighlights.push(highlight),
    groupEdgeFinder: {
      findGroupProxyEdgeTargetAt: () => null,
      findGroupGateTargetAt: () => null,
    },
    groupController: {
      nodeGroups: writable([]),
    },
    nodeEngine: {
      exportGraph: () => ({ nodes: [] }),
      getNode: () => ({ type: 'number', config: {} }),
      lastError: { set: () => undefined },
    },
    nodeRegistry: {
      get: () => ({
        inputs: [{ id: 'in', type: 'number' }],
        outputs: [{ id: 'out', type: 'number' }],
      }),
    },
    canvasCommands: {
      connect: (connection) => {
        connected.push(connection);
      },
    },
    groupPortNodesController: {
      scheduleAlign: () => undefined,
      scheduleNormalizeProxies: () => undefined,
    },
    computeGraphPosition: () => ({ x: 0, y: 0 }),
    addNode: () => undefined,
    findPortRowSocketAt: () => null,
    openConnectPicker: (socket) => openedSockets.push(socket),
    isProjectionId: (id) => String(id).startsWith('view:'),
  });

  return { pipe, connected, openedSockets, draggingSockets, edgeHighlights };
}

test('connectionpick from a projection socket is view-only', () => {
  const { pipe, draggingSockets, edgeHighlights } = createHarness();

  pipe({
    type: 'connectionpick',
    data: {
      socket: { nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' },
    },
  });

  assert.deepEqual(draggingSockets, [null]);
  assert.deepEqual(edgeHighlights, [null]);
});

test('connectiondrop from a projection socket does not create semantic connections or open picker', () => {
  const { pipe, connected, openedSockets } = createHarness();

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' },
      socket: {},
    },
  });

  assert.deepEqual(connected, []);
  assert.deepEqual(openedSockets, []);
});
