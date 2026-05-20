// Purpose: Regression tests for Rete connection events flowing through semantic canvas commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { bindRetePipes } from './rete-pipes';

function createHarness() {
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

  bindRetePipes({
    editor: editor as never,
    areaPlugin: areaPlugin as never,
    nodeEngine: {
      removeNode: () => undefined,
      updateNodePosition: () => undefined,
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
    connectionMap: new Map(),
    isSyncing: () => false,
    setSelectedNode: () => undefined,
    groupSelectionNodeIds: writable(new Set<string>()),
    isProgrammaticTranslate: () => false,
    handleDroppedNodesAfterDrag: () => undefined,
    requestFramesUpdate: () => undefined,
    requestMinimapUpdate: () => undefined,
  });

  return { editorPipes, connections, disconnected };
}

test('bindRetePipes routes connectioncreated through semantic canvas connect command', async () => {
  const { editorPipes, connections } = createHarness();

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
