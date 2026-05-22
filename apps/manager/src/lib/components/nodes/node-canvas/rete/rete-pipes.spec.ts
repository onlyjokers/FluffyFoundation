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
  const removedNodes: string[] = [];
  const movedNodes: Array<{ id: string; pos: { x: number; y: number } }> = [];

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
    connectionMap: new Map(),
    isSyncing: () => false,
    setSelectedNode: () => undefined,
    groupSelectionNodeIds: writable(new Set<string>()),
    isProgrammaticTranslate: () => false,
    handleDroppedNodesAfterDrag: () => undefined,
    requestFramesUpdate: () => undefined,
    requestMinimapUpdate: () => undefined,
    isProjectionId: (id) => String(id).startsWith('view:'),
  });

  return { editorPipes, areaPipes, connections, disconnected, removedNodes, movedNodes };
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

test('bindRetePipes ignores editor-only projection mutations', async () => {
  const { editorPipes, areaPipes, connections, disconnected, removedNodes, movedNodes } = createHarness();

  await editorPipes[0]?.({
    type: 'connectioncreated',
    data: {
      id: 'view:c1',
      source: 'view:source',
      sourceOutput: 'out',
      target: 'view:target',
      targetInput: 'in',
    },
  });
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
  await areaPipes[0]?.({
    type: 'nodetranslated',
    data: { id: 'view:node', position: { x: 1, y: 2 }, previous: { x: 0, y: 0 } },
  });

  assert.deepEqual(connections, []);
  assert.deepEqual(disconnected, []);
  assert.deepEqual(removedNodes, []);
  assert.deepEqual(movedNodes, []);
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
