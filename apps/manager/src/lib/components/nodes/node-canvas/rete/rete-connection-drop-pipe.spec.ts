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
  exitTarget?: {
    groupId: string;
    side: 'input' | 'output';
    frame: { left: number; top: number; width: number; height: number; group?: { minimized?: boolean } };
  } | null;
  exitNodeId?: string;
  memberTarget?: {
    groupId: string;
    side: 'input' | 'output';
    frame: { left: number; top: number; width: number; height: number; group?: { minimized?: boolean } };
  } | null;
  frameAtTarget?: {
    groupId: string;
    side: 'input' | 'output';
    frame: { left: number; top: number; width: number; height: number; group?: { minimized?: boolean } };
  } | null;
  graphNodes?: Array<{ id?: string; type?: string; config?: unknown }>;
  pointer?: { x: number; y: number };
  existingConnections?: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }>;
  getNode?: (nodeId: string) => { type?: string; config?: unknown } | null | undefined;
  nodeRegistryGet?: (type: string) =>
    | {
        inputs?: Array<{ id?: string; type?: string }>;
        outputs?: Array<{ id?: string; type?: string }>;
      }
    | null
    | undefined;
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
  const disconnected: string[] = [];
  const addedNodes: Array<{ type: string; position?: { x: number; y: number }; configPatch?: Record<string, unknown> }> =
    [];
  const openedSockets: unknown[] = [];
  const draggingSockets: unknown[] = [];
  const edgeHighlights: unknown[] = [];
  const projectionConnectionTranslations: unknown[] = [];

  const pipe = createReteConnectionDropPipe({
    getLastPointerClient: () => options.pointer ?? { x: 100, y: 120 },
    setConnectDraggingSocket: (socket) => draggingSockets.push(socket),
    setGroupEdgeHighlight: (highlight) => edgeHighlights.push(highlight),
    groupEdgeFinder: {
      findGroupProxyEdgeTargetAt: () => options.edgeTarget ?? null,
      findGroupFrameForNodeAt: (nodeId) =>
        String(nodeId) === (options.exitNodeId ?? 'inside') ? (options.exitTarget ?? null) : null,
      findGroupFrameForNode: () => options.memberTarget ?? null,
      findGroupFrameAt: () => options.frameAtTarget ?? null,
      findGroupGateTargetAt: () => null,
    },
    groupController: {
      nodeGroups: writable([]),
    },
    nodeEngine: {
      exportGraph: () => ({ nodes: options.graphNodes ?? [], connections: options.existingConnections ?? [] }),
      getNode: options.getNode ?? (() => ({ type: 'number', config: {} })),
      lastError: { set: () => undefined },
    },
    nodeRegistry: {
      get: options.nodeRegistryGet ?? (() => ({
        inputs: [{ id: 'in', type: 'number' }],
        outputs: [{ id: 'out', type: 'number' }],
      })),
    },
    canvasCommands: {
      connect: (connection) => {
        connected.push(connection);
      },
      disconnect: (connectionId) => {
        disconnected.push(connectionId);
      },
    },
    groupPortNodesController: {
      scheduleAlign: () => undefined,
      scheduleNormalizeProxies: () => undefined,
    },
    computeGraphPosition: () => ({ x: 0, y: 0 }),
    addNode:
      options.addNode ??
      ((type, position, configPatch) => {
        addedNodes.push({ type, position, configPatch });
        return 'proxy-new';
      }),
    findPortRowSocketAt: options.findPortRowSocketAt ?? (() => null),
    openConnectPicker: (socket) => openedSockets.push(socket),
    isProjectionId: (id) => String(id).startsWith('view:'),
    translateProjectionConnection: (connection) => {
      projectionConnectionTranslations.push(connection);
      return options.translateProjectionConnection?.(connection) ?? null;
    },
  });

  return {
    pipe,
    connected,
    disconnected,
    addedNodes,
    openedSockets,
    draggingSockets,
    edgeHighlights,
    projectionConnectionTranslations,
  };
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

test('connectiondrop from inside a group to outside the group creates an output proxy', () => {
  const { pipe, connected } = createHarness({
    graphNodes: [
      {
        id: 'inside',
        type: 'number',
        config: {},
      },
    ],
    edgeTarget: null,
    exitTarget: {
      groupId: 'group-1',
      side: 'output',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 540, y: 120 },
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'inside', side: 'output', key: 'out' },
      socket: {},
    },
  });

  assert.deepEqual(connected, [
    {
      id: (connected[0] as { id?: string } | undefined)?.id,
      sourceNodeId: 'inside',
      sourcePortId: 'out',
      targetNodeId: 'proxy-new',
      targetPortId: 'in',
    },
  ]);
});

test('connectiondrop from inside a group to an outside port wires through the output proxy', () => {
  const { pipe, connected } = createHarness({
    edgeTarget: null,
    exitTarget: {
      groupId: 'group-1',
      side: 'output',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 540, y: 120 },
    findPortRowSocketAt: () => ({ nodeId: 'outside', side: 'input', key: 'in' }),
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'inside', side: 'output', key: 'out' },
      socket: {},
    },
  });

  assert.deepEqual(
    connected.map((conn) => ({
      sourceNodeId: (conn as { sourceNodeId: string }).sourceNodeId,
      sourcePortId: (conn as { sourcePortId: string }).sourcePortId,
      targetNodeId: (conn as { targetNodeId: string }).targetNodeId,
      targetPortId: (conn as { targetPortId: string }).targetPortId,
    })),
    [
      { sourceNodeId: 'inside', sourcePortId: 'out', targetNodeId: 'proxy-new', targetPortId: 'in' },
      { sourceNodeId: 'proxy-new', sourcePortId: 'out', targetNodeId: 'outside', targetPortId: 'in' },
    ]
  );
});

test('connectiondrop that already created an inside-to-outside connection rewires through the output proxy', () => {
  const { pipe, connected, disconnected } = createHarness({
    edgeTarget: null,
    exitTarget: {
      groupId: 'group-1',
      side: 'output',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 540, y: 120 },
    existingConnections: [
      {
        id: 'rete-created',
        sourceNodeId: 'inside',
        sourcePortId: 'out',
        targetNodeId: 'outside',
        targetPortId: 'in',
      },
    ],
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: true,
      initial: { nodeId: 'inside', side: 'output', key: 'out' },
      socket: { nodeId: 'outside', side: 'input', key: 'in' },
    },
  });

  assert.deepEqual(disconnected, ['rete-created']);
  assert.deepEqual(
    connected.map((conn) => ({
      sourceNodeId: (conn as { sourceNodeId: string }).sourceNodeId,
      sourcePortId: (conn as { sourcePortId: string }).sourcePortId,
      targetNodeId: (conn as { targetNodeId: string }).targetNodeId,
      targetPortId: (conn as { targetPortId: string }).targetPortId,
    })),
    [
      { sourceNodeId: 'inside', sourcePortId: 'out', targetNodeId: 'proxy-new', targetPortId: 'in' },
      { sourceNodeId: 'proxy-new', sourcePortId: 'out', targetNodeId: 'outside', targetPortId: 'in' },
    ]
  );
});

test('connectiondrop that already created an outside-to-inside connection rewires through the input proxy', () => {
  const { pipe, connected, disconnected, addedNodes } = createHarness({
    edgeTarget: null,
    exitTarget: null,
    memberTarget: {
      groupId: 'group-1',
      side: 'input',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 160, y: 140 },
    existingConnections: [
      {
        id: 'rete-created-input',
        sourceNodeId: 'outside',
        sourcePortId: 'out',
        targetNodeId: 'inside',
        targetPortId: 'in',
      },
    ],
    getNode: (nodeId) => ({ type: nodeId === 'inside' ? 'pulse-target' : 'any-source', config: {} }),
    nodeRegistryGet: (type) =>
      type === 'pulse-target'
        ? { inputs: [{ id: 'in', type: 'pulse' }], outputs: [] }
        : { inputs: [], outputs: [{ id: 'out', type: 'any' }] },
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: true,
      initial: { nodeId: 'outside', side: 'output', key: 'out' },
      socket: { nodeId: 'inside', side: 'input', key: 'in' },
    },
  });

  assert.deepEqual(disconnected, ['rete-created-input']);
  assert.equal(addedNodes[0]?.configPatch?.portType, 'pulse');
  assert.deepEqual(
    connected.map((conn) => ({
      sourceNodeId: (conn as { sourceNodeId: string }).sourceNodeId,
      sourcePortId: (conn as { sourcePortId: string }).sourcePortId,
      targetNodeId: (conn as { targetNodeId: string }).targetNodeId,
      targetPortId: (conn as { targetPortId: string }).targetPortId,
    })),
    [
      { sourceNodeId: 'outside', sourcePortId: 'out', targetNodeId: 'proxy-new', targetPortId: 'in' },
      { sourceNodeId: 'proxy-new', sourcePortId: 'out', targetNodeId: 'inside', targetPortId: 'in' },
    ]
  );
});

test('connectiondrop from outside to a group interior creates an input proxy instead of opening picker', () => {
  const { pipe, connected, openedSockets, addedNodes } = createHarness({
    edgeTarget: null,
    exitTarget: null,
    memberTarget: null,
    frameAtTarget: {
      groupId: 'group-1',
      side: 'input',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 160, y: 140 },
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'outside', side: 'output', key: 'out' },
      socket: {},
    },
  });

  assert.deepEqual(openedSockets, []);
  assert.equal(addedNodes[0]?.configPatch?.direction, 'input');
  assert.deepEqual(
    connected.map((conn) => ({
      sourceNodeId: (conn as { sourceNodeId: string }).sourceNodeId,
      sourcePortId: (conn as { sourcePortId: string }).sourcePortId,
      targetNodeId: (conn as { targetNodeId: string }).targetNodeId,
      targetPortId: (conn as { targetPortId: string }).targetPortId,
    })),
    [{ sourceNodeId: 'outside', sourcePortId: 'out', targetNodeId: 'proxy-new', targetPortId: 'in' }]
  );
});

test('connectiondrop to a group interior does not open picker when proxy id is deferred', () => {
  const addedNodes: Array<{
    type: string;
    position?: { x: number; y: number };
    configPatch?: Record<string, unknown>;
  }> = [];
  const { pipe, connected, openedSockets } = createHarness({
    edgeTarget: null,
    exitTarget: null,
    memberTarget: null,
    frameAtTarget: {
      groupId: 'group-1',
      side: 'input',
      frame: { left: 100, top: 100, width: 400, height: 300 },
    },
    pointer: { x: 160, y: 140 },
    addNode: (type, position, configPatch) => {
      addedNodes.push({ type, position, configPatch });
      return undefined;
    },
  });

  pipe({
    type: 'connectiondrop',
    data: {
      created: false,
      initial: { nodeId: 'outside', side: 'output', key: 'out' },
      socket: {},
    },
  });

  assert.equal(addedNodes[0]?.type, 'group-proxy');
  assert.equal(addedNodes[0]?.configPatch?.direction, 'input');
  assert.deepEqual(connected, []);
  assert.deepEqual(openedSockets, []);
});
