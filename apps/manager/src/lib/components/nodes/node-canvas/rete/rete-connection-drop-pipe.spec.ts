// Purpose: Regression tests for Rete connection drag/drop isolation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createReteConnectionDropPipe } from './rete-connection-drop-pipe';

type HarnessOptions = {
  edgeTarget?: {
    groupId: string;
    side: 'input' | 'output';
    frame: { left: number; top: number; width: number; height: number; group?: { minimized?: boolean } };
  } | null;
  addNode?: (
    type: string,
    position?: { x: number; y: number },
    configPatch?: Record<string, unknown>
  ) => string | undefined;
  findPortRowSocketAt?: (
    clientX: number,
    clientY: number,
    desiredSide: 'input' | 'output'
  ) => { nodeId: string; side: 'input' | 'output'; key: string } | null;
  translateProjectionConnection?: (connection: {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }) =>
    | {
        id: string;
        sourceNodeId: string;
        sourcePortId: string;
        targetNodeId: string;
        targetPortId: string;
      }
    | null;
};

function createHarness(options: HarnessOptions = {}) {
  const connected: unknown[] = [];
  const openedSockets: unknown[] = [];
  const draggingSockets: unknown[] = [];
  const edgeHighlights: unknown[] = [];
  const projectionConnectionTranslations: unknown[] = [];

  const pipe = createReteConnectionDropPipe({
    getLastPointerClient: () => ({ x: 100, y: 120 }),
    setConnectDraggingSocket: (socket) => draggingSockets.push(socket),
    setGroupEdgeHighlight: (highlight) => edgeHighlights.push(highlight),
    groupEdgeFinder: {
      findGroupProxyEdgeTargetAt: () => options.edgeTarget ?? null,
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
    addNode: options.addNode ?? (() => undefined),
    findPortRowSocketAt: options.findPortRowSocketAt ?? (() => null),
    openConnectPicker: (socket) => openedSockets.push(socket),
    isProjectionId: (id) => String(id).startsWith('view:'),
    translateProjectionConnection: (connection) => {
      projectionConnectionTranslations.push(connection);
      return options.translateProjectionConnection?.(connection) ?? null;
    },
  });

  return { pipe, connected, openedSockets, draggingSockets, edgeHighlights, projectionConnectionTranslations };
}

test('connectionpick from a projection socket starts a normal drag', () => {
  const { pipe, draggingSockets, edgeHighlights } = createHarness();

  pipe({
    type: 'connectionpick',
    data: {
      socket: { nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' },
    },
  });

  assert.deepEqual(draggingSockets, [
    { nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' },
  ]);
  assert.deepEqual(edgeHighlights, [null]);
});

test('connectiondrop from a projection socket can open the normal connect picker', () => {
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
  assert.deepEqual(openedSockets, [{ nodeId: 'view:custom:owner:inner', side: 'output', key: 'out' }]);
});

test('connectiondrop to a projection socket translates to custom node public port', () => {
  const { pipe, connected, projectionConnectionTranslations } = createHarness({
    findPortRowSocketAt: () => ({
      nodeId: 'view:custom:custom-1:input-proxy',
      side: 'input',
      key: 'in',
    }),
    translateProjectionConnection: () => ({
      id: 'canonical-c1',
      sourceNodeId: 'number-1',
      sourcePortId: 'value',
      targetNodeId: 'custom-1',
      targetPortId: 'amount',
    }),
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'number-1', side: 'output', key: 'value' },
      socket: {},
    },
  });

  assert.equal(projectionConnectionTranslations.length, 1);
  assert.deepEqual(
    {
      sourceNodeId: (projectionConnectionTranslations[0] as { sourceNodeId: string }).sourceNodeId,
      sourcePortId: (projectionConnectionTranslations[0] as { sourcePortId: string }).sourcePortId,
      targetNodeId: (projectionConnectionTranslations[0] as { targetNodeId: string }).targetNodeId,
      targetPortId: (projectionConnectionTranslations[0] as { targetPortId: string }).targetPortId,
    },
    {
      sourceNodeId: 'number-1',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:input-proxy',
      targetPortId: 'in',
    }
  );
  assert.deepEqual(connected, [
    {
      id: 'canonical-c1',
      sourceNodeId: 'number-1',
      sourcePortId: 'value',
      targetNodeId: 'custom-1',
      targetPortId: 'amount',
    },
  ]);
});

test('connectiondrop from a projection socket to a group edge creates projection proxy wiring only', () => {
  const { pipe, connected, projectionConnectionTranslations } = createHarness({
    edgeTarget: {
      groupId: 'group:custom',
      side: 'output',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    addNode: () => 'view:custom:custom-1:proxy-out',
    translateProjectionConnection: () => null,
  });
  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'view:custom:custom-1:inner', side: 'output', key: 'value' },
      socket: {},
    },
  });

  assert.deepEqual(connected, []);
  assert.deepEqual(projectionConnectionTranslations, [
    {
      id: (projectionConnectionTranslations[0] as { id?: string } | undefined)?.id,
      sourceNodeId: 'view:custom:custom-1:inner',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:proxy-out',
      targetPortId: 'in',
    },
  ]);
});
