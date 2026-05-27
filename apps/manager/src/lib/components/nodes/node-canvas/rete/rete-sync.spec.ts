// Purpose: Regression tests for syncing semantic graph state into the Rete editor view.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClassicPreset } from 'rete';

import { createGraphSync } from './rete-sync';
import type { NodeInstance } from '$lib/nodes/types';

const socket = new ClassicPreset.Socket('test');

const node = (id: string, x: number, y: number): NodeInstance => ({
  id,
  type: 'number',
  position: { x, y },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('graph sync skips translate calls when node positions are unchanged', async () => {
  const nodeMap = new Map<string, ClassicPreset.Node>();
  const connectionMap = new Map();
  const editorNodes = new Map<string, ClassicPreset.Node>();
  const translations: Array<{ id: string; x: number; y: number }> = [];

  const graphSync = createGraphSync({
    editor: {
      getNode: (id: string) => editorNodes.get(id),
      addNode: async (reteNode: ClassicPreset.Node) => {
        editorNodes.set(reteNode.id, reteNode);
      },
      removeNode: async (id: string) => {
        editorNodes.delete(id);
      },
      getNodes: () => Array.from(editorNodes.values()),
      getConnection: () => undefined,
      addConnection: async () => undefined,
      removeConnection: async () => undefined,
      getConnections: () => [],
    } as any,
    areaPlugin: {
      translate: async (id: string, position: { x: number; y: number }) => {
        translations.push({ id, x: position.x, y: position.y });
      },
      update: async () => undefined,
    } as any,
    nodeMap,
    connectionMap,
    nodeRegistry: {
      get: () => ({
        type: 'number',
        label: 'Number',
        category: 'Test',
        inputs: [],
        outputs: [],
        configSchema: [],
        process: () => ({}),
      }),
    } as any,
    socketFor: () => socket,
    buildReteNode: (instance) => {
      const reteNode = new ClassicPreset.Node(String(instance.id));
      reteNode.id = String(instance.id);
      return reteNode;
    },
    nodeLabel: () => 'Number',
    applyMidiMapRangeConstraints: async () => undefined,
    setGraphState: () => undefined,
    setNodeCount: () => undefined,
    getSelectedNodeId: () => '',
    onAfterSync: () => undefined,
    isSyncingRef: { value: false },
  });

  const firstState = { nodes: [node('n1', 10, 20)], connections: [] };
  await graphSync.schedule(firstState);
  assert.deepEqual(translations, [{ id: 'n1', x: 10, y: 20 }]);

  await graphSync.schedule(firstState);
  assert.deepEqual(translations, [{ id: 'n1', x: 10, y: 20 }]);

  await graphSync.schedule({ nodes: [node('n1', 11, 20)], connections: [] });
  assert.deepEqual(translations, [
    { id: 'n1', x: 10, y: 20 },
    { id: 'n1', x: 11, y: 20 },
  ]);
});

test('graph sync rebuilds existing non-custom nodes when dynamic port shape changes', async () => {
  const nodeMap = new Map<string, ClassicPreset.Node>();
  const connectionMap = new Map();
  const editorNodes = new Map<string, ClassicPreset.Node>();
  let inputIds = ['in'];
  const removedNodes: string[] = [];
  const translations: Array<{ id: string; x: number; y: number }> = [];

  const graphSync = createGraphSync({
    editor: {
      getNode: (id: string) => editorNodes.get(id),
      addNode: async (reteNode: ClassicPreset.Node) => {
        editorNodes.set(reteNode.id, reteNode);
      },
      removeNode: async (id: string) => {
        removedNodes.push(id);
        editorNodes.delete(id);
      },
      getNodes: () => Array.from(editorNodes.values()),
      getConnection: () => undefined,
      addConnection: async () => undefined,
      removeConnection: async () => undefined,
      getConnections: () => [],
    } as any,
    areaPlugin: {
      translate: async (id: string, position: { x: number; y: number }) => {
        translations.push({ id, x: position.x, y: position.y });
      },
      update: async () => undefined,
    } as any,
    nodeMap,
    connectionMap,
    nodeRegistry: {
      get: () => ({
        type: 'group-proxy',
        label: 'Group Proxy',
        category: 'Group',
        inputs: inputIds.map((id) => ({ id, label: id, type: 'any' })),
        outputs: [],
        configSchema: [],
        process: () => ({}),
      }),
    } as any,
    socketFor: () => socket,
    buildReteNode: (instance) => {
      const reteNode = new ClassicPreset.Node(String(instance.id));
      reteNode.id = String(instance.id);
      for (const id of inputIds) reteNode.addInput(id, new ClassicPreset.Input(socket, id));
      return reteNode;
    },
    nodeLabel: () => 'Group Proxy',
    applyMidiMapRangeConstraints: async () => undefined,
    setGraphState: () => undefined,
    setNodeCount: () => undefined,
    getSelectedNodeId: () => '',
    onAfterSync: () => undefined,
    isSyncingRef: { value: false },
  });

  await graphSync.schedule({ nodes: [node('proxy', 0, 0)], connections: [] });
  assert.deepEqual(Object.keys(nodeMap.get('proxy')?.inputs ?? {}), ['in']);
  assert.deepEqual(translations, [{ id: 'proxy', x: 0, y: 0 }]);

  inputIds = ['in', 'extra'];
  await graphSync.schedule({ nodes: [node('proxy', 0, 0)], connections: [] });

  assert.deepEqual(removedNodes, ['proxy']);
  assert.deepEqual(Object.keys(nodeMap.get('proxy')?.inputs ?? {}), ['in', 'extra']);
  assert.deepEqual(translations, [
    { id: 'proxy', x: 0, y: 0 },
    { id: 'proxy', x: 0, y: 0 },
  ]);
});
