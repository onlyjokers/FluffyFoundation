// Purpose: Regression tests for Rete connection events flowing through semantic canvas commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { bindRetePipes } from './rete-pipes';

function createHarness(
  options: {
    translateProjectionConnection?: (connection: unknown) => unknown;
    updateProjectionNodePosition?: (nodeId: string, position: { x: number; y: number }) => boolean;
    isProjectionEditable?: (nodeId: string) => boolean;
  } = {}
) {
  const editorPipes: Array<(ctx: Record<string, unknown>) => Promise<Record<string, unknown>>> = [];
  const areaPipes: Array<(ctx: Record<string, unknown>) => Promise<Record<string, unknown>>> = [];
  const editor = {
    addPipe: (pipe: (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
      editorPipes.push(pipe);
    },
    getConnection: () => null,
    removeConnection: async () => undefined,
  };
  const areaPlugin = {
    addPipe: (pipe: (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
      areaPipes.push(pipe);
    },
    update: async () => undefined,
    nodeViews: new Map(),
  };
  const connections: unknown[] = [];
  const disconnected: string[] = [];
  const removedNodes: string[] = [];
  const movedNodes: Array<{ id: string; pos: { x: number; y: number } }> = [];
  const projectionConnectionTranslations: unknown[] = [];
  const projectionPositionUpdates: unknown[] = [];
  const connectionMap = new Map();

  bindRetePipes({
    editor: editor as never,
    areaPlugin: areaPlugin as never,
    nodeEngine: {
      removeNode: (id) => {
        removedNodes.push(id);
      },
      updateNodePosition: (id, pos) => {
        movedNodes.push({ id, pos });
      },
    },
    canvasCommands: {
      connect: (connection) => {
        connections.push(connection);
        return true;
      },
      disconnect: (connectionId) => {
        disconnected.push(connectionId);
        return true;
      },
    },
    nodeMap: new Map(),
    connectionMap,
    isSyncing: () => false,
    setSelectedNode: () => undefined,
    groupSelectionNodeIds: writable(new Set<string>()),
    isProgrammaticTranslate: () => false,
    handleDroppedNodesAfterDrag: () => undefined,
    requestFramesUpdate: () => undefined,
    requestMinimapUpdate: () => undefined,
    isProjectionId: (id) => String(id).startsWith('view:'),
    isProjectionEditable: options.isProjectionEditable ?? (() => true),
    translateProjectionConnection: (connection) => {
      projectionConnectionTranslations.push(connection);
      return options.translateProjectionConnection?.(connection) ?? null;
    },
    updateProjectionNodePosition: (nodeId, position) => {
      projectionPositionUpdates.push({ nodeId, position });
      return options.updateProjectionNodePosition?.(nodeId, position) ?? true;
    },
  });

  return {
    editorPipes,
    areaPipes,
    connections,
    disconnected,
    removedNodes,
    movedNodes,
    projectionConnectionTranslations,
    projectionPositionUpdates,
    connectionMap,
  };
}

test('bindRetePipes routes connectioncreated through semantic canvas connect command', async () => {
  const { editorPipes, connections, connectionMap } = createHarness();

  await editorPipes[0]?.({
    type: 'connectioncreated',
    data: {
      id: 'c1',
      source: 'source',
      sourceOutput: 'out',
      target: 'target',
      targetInput: 'in',
    },
  });

  assert.deepEqual(connections, [
    {
      id: 'c1',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: 'target',
      targetPortId: 'in',
    },
  ]);
  assert.equal(connectionMap.has('c1'), true);
});

test('bindRetePipes routes connectionremoved through semantic canvas disconnect command', async () => {
  const { editorPipes, disconnected } = createHarness();

  await editorPipes[0]?.({
    type: 'connectionremoved',
    data: {
      id: 'c1',
      target: 'target',
      targetInput: 'in',
    },
  });

  assert.deepEqual(disconnected, ['c1']);
});

test('bindRetePipes keeps projection removals editor-only', async () => {
  const { editorPipes, connections, disconnected, removedNodes } = createHarness();

  await editorPipes[0]?.({
    type: 'connectionremoved',
    data: {
      id: 'view:c1',
      target: 'view:target',
      targetInput: 'in',
    },
  });
  await editorPipes[0]?.({
    type: 'noderemoved',
    data: { id: 'view:node' },
  });

  assert.deepEqual(connections, []);
  assert.deepEqual(disconnected, []);
  assert.deepEqual(removedNodes, []);
});

test('bindRetePipes writes projection node movement through projection callback', async () => {
  const { areaPipes, movedNodes, projectionPositionUpdates } = createHarness();

  await areaPipes[0]?.({
    type: 'nodetranslated',
    data: {
      id: 'view:custom:custom-1:inner',
      position: { x: 1, y: 2 },
      previous: { x: 0, y: 0 },
    },
  });

  assert.deepEqual(movedNodes, []);
  assert.deepEqual(projectionPositionUpdates, [
    { nodeId: 'view:custom:custom-1:inner', position: { x: 1, y: 2 } },
  ]);
});

test('bindRetePipes ignores no-op projection node translations', async () => {
  const { areaPipes, movedNodes, projectionPositionUpdates } = createHarness();

  await areaPipes[0]?.({
    type: 'nodetranslated',
    data: {
      id: 'view:custom:custom-1:inner',
      position: { x: 120, y: 240 },
      previous: { x: 120, y: 240 },
    },
  });

  assert.deepEqual(movedNodes, []);
  assert.deepEqual(projectionPositionUpdates, []);
});

test('bindRetePipes keeps read-only projection movement editor-only', async () => {
  const { areaPipes, movedNodes, projectionPositionUpdates } = createHarness({
    isProjectionEditable: () => false,
  });

  await areaPipes[0]?.({
    type: 'nodetranslated',
    data: {
      id: 'view:custom:custom-1:inner',
      position: { x: 1, y: 2 },
      previous: { x: 0, y: 0 },
    },
  });

  assert.deepEqual(movedNodes, []);
  assert.deepEqual(projectionPositionUpdates, []);
});

test('bindRetePipes writes same-owner projection connections through projection callback', async () => {
  const { editorPipes, connections, projectionConnectionTranslations } = createHarness({
    translateProjectionConnection: () => null,
  });

  await editorPipes[0]?.({
    type: 'connectioncreated',
    data: {
      id: 'view:c1',
      source: 'view:custom:custom-1:a',
      sourceOutput: 'value',
      target: 'view:custom:custom-1:b',
      targetInput: 'value',
    },
  });

  assert.deepEqual(projectionConnectionTranslations, [
    {
      id: 'view:c1',
      sourceNodeId: 'view:custom:custom-1:a',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:b',
      targetPortId: 'value',
    },
  ]);
  assert.deepEqual(connections, []);
});

test('bindRetePipes keeps read-only projection connections editor-only', async () => {
  const { editorPipes, connections, projectionConnectionTranslations } = createHarness({
    isProjectionEditable: () => false,
    translateProjectionConnection: () => null,
  });

  await editorPipes[0]?.({
    type: 'connectioncreated',
    data: {
      id: 'view:c1',
      source: 'view:custom:custom-1:a',
      sourceOutput: 'value',
      target: 'view:custom:custom-1:b',
      targetInput: 'value',
    },
  });

  assert.deepEqual(projectionConnectionTranslations, []);
  assert.deepEqual(connections, []);
});

test('bindRetePipes translates external projection connections to custom node public ports', async () => {
  const { editorPipes, connections, projectionConnectionTranslations, connectionMap } =
    createHarness({
      translateProjectionConnection: () => ({
        id: 'canonical-c1',
        sourceNodeId: 'external-source',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'amount',
      }),
    });

  await editorPipes[0]?.({
    type: 'connectioncreated',
    data: {
      id: 'view:transient',
      source: 'external-source',
      sourceOutput: 'value',
      target: 'view:custom:custom-1:input-proxy',
      targetInput: 'in',
    },
  });

  assert.deepEqual(projectionConnectionTranslations, [
    {
      id: 'view:transient',
      sourceNodeId: 'external-source',
      sourcePortId: 'value',
      targetNodeId: 'view:custom:custom-1:input-proxy',
      targetPortId: 'in',
    },
  ]);
  assert.deepEqual(connections, [
    {
      id: 'canonical-c1',
      sourceNodeId: 'external-source',
      sourcePortId: 'value',
      targetNodeId: 'custom-1',
      targetPortId: 'amount',
    },
  ]);
  assert.equal(connectionMap.has('canonical-c1'), false);
});

test('bindRetePipes ignores malformed editor removal events instead of issuing semantic commands', async () => {
  const { editorPipes, disconnected, removedNodes } = createHarness();

  await editorPipes[0]?.({
    type: 'connectionremoved',
    data: {},
  });
  await editorPipes[0]?.({
    type: 'noderemoved',
    data: {},
  });

  assert.deepEqual(disconnected, []);
  assert.deepEqual(removedNodes, []);
});
