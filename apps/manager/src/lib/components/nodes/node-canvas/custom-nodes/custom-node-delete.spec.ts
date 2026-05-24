// Purpose: Verify Node Graph deletion keeps server semantic graph in sync.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDeleteNodeWithRules } from './custom-node-delete';
import type { NodeInstance } from '$lib/nodes/types';

test('deleteNodeWithRules delegates local removal to a successful semantic remove command', () => {
  const node: NodeInstance = {
    id: 'n1',
    type: 'number',
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
  };
  const nodes = new Map([[node.id, node]]);
  const semanticRemovals: string[] = [];
  const localRemovals: string[] = [];

  const deleteNode = createDeleteNodeWithRules({
    nodeEngine: {
      getNode: (id) => nodes.get(id),
      removeNode: (id) => {
        localRemovals.push(id);
        nodes.delete(id);
      },
      exportGraph: () => ({ nodes: Array.from(nodes.values()) }),
    },
    readCustomNodeState: () => null,
    getCustomNodeDefinition: () => undefined,
    removeCustomNodeDefinition: () => undefined,
    getSelectedNodeId: () => '',
    setSelectedNode: () => undefined,
    confirm: () => true,
    removeNodeCommand: (id) => {
      semanticRemovals.push(id);
      return true;
    },
  });

  deleteNode('n1');

  assert.deepEqual(semanticRemovals, ['n1']);
  assert.deepEqual(localRemovals, []);
});

test('deleteNodeWithRules removes only the mother instance and keeps definition plus children', () => {
  const mother: NodeInstance = {
    id: 'mother-1',
    type: 'custom:pulse',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'pulse',
        groupId: 'group:mother',
        role: 'mother',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const child: NodeInstance = {
    id: 'child-1',
    type: 'custom:pulse',
    position: { x: 100, y: 0 },
    config: {
      customNode: {
        definitionId: 'pulse',
        groupId: 'group:child',
        role: 'child',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const nodes = new Map([
    [mother.id, mother],
    [child.id, child],
  ]);
  const messages: string[] = [];
  const removedDefinitions: string[] = [];
  const removals: string[] = [];

  const deleteNode = createDeleteNodeWithRules({
    nodeEngine: {
      getNode: (id) => nodes.get(id),
      removeNode: (id) => {
        removals.push(id);
        nodes.delete(id);
      },
      exportGraph: () => ({ nodes: Array.from(nodes.values()) }),
    },
    readCustomNodeState: (config) => (config.customNode as any) ?? null,
    getCustomNodeDefinition: () => ({
      definitionId: 'pulse',
      name: 'Pulse',
      template: { nodes: [], connections: [] },
      ports: [],
    }),
    removeCustomNodeDefinition: (definitionId) => removedDefinitions.push(definitionId),
    getSelectedNodeId: () => 'mother-1',
    setSelectedNode: () => undefined,
    confirm: (message) => {
      messages.push(message);
      return true;
    },
  });

  deleteNode('mother-1');

  assert.deepEqual(removals, ['mother-1']);
  assert.equal(nodes.has('child-1'), true);
  assert.deepEqual(removedDefinitions, []);
  assert.match(messages[0] ?? '', /You can reintroduce the parent node in Node Manager/);
});

test('deleteNodeWithRules locally removes mother when semantic remove accepts', () => {
  const mother: NodeInstance = {
    id: 'mother-1',
    type: 'custom:pulse',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'pulse',
        groupId: 'group:mother',
        role: 'mother',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const nodes = new Map([[mother.id, mother]]);
  const semanticRemovals: string[] = [];
  const localRemovals: string[] = [];

  const deleteNode = createDeleteNodeWithRules({
    nodeEngine: {
      getNode: (id) => nodes.get(id),
      removeNode: (id) => {
        localRemovals.push(id);
        nodes.delete(id);
      },
      exportGraph: () => ({ nodes: Array.from(nodes.values()) }),
    },
    readCustomNodeState: (config) => (config.customNode as any) ?? null,
    getCustomNodeDefinition: () => ({
      definitionId: 'pulse',
      name: 'Pulse',
      template: { nodes: [], connections: [] },
      ports: [],
    }),
    getSelectedNodeId: () => 'mother-1',
    setSelectedNode: () => undefined,
    confirm: () => true,
    removeNodeCommand: (id) => {
      semanticRemovals.push(id);
      return true;
    },
  });

  deleteNode('mother-1');

  assert.deepEqual(semanticRemovals, ['mother-1']);
  assert.deepEqual(localRemovals, ['mother-1']);
  assert.equal(nodes.has('mother-1'), false);
});

test('deleteNodeWithRules calls browser confirm without illegal invocation', () => {
  const mother: NodeInstance = {
    id: 'mother-1',
    type: 'custom:pulse',
    position: { x: 0, y: 0 },
    config: {
      customNode: {
        definitionId: 'pulse',
        groupId: 'group:mother',
        role: 'mother',
        manualGate: true,
        internal: { nodes: [], connections: [] },
      },
    },
    inputValues: {},
    outputValues: {},
  };
  const nodes = new Map([[mother.id, mother]]);
  const previousConfirm = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
  const browserLikeConfirm = function (this: typeof globalThis, message: string) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return message.includes('Delete mother');
  };
  (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm =
    browserLikeConfirm;

  try {
    const deleteNode = createDeleteNodeWithRules({
      nodeEngine: {
        getNode: (id) => nodes.get(id),
        removeNode: (id) => {
          nodes.delete(id);
        },
        exportGraph: () => ({ nodes: Array.from(nodes.values()) }),
      },
      readCustomNodeState: (config) => (config.customNode as any) ?? null,
      getCustomNodeDefinition: () => ({
        definitionId: 'pulse',
        name: 'Pulse',
        template: { nodes: [], connections: [] },
        ports: [],
      }),
      getSelectedNodeId: () => 'mother-1',
      setSelectedNode: () => undefined,
      confirm: browserLikeConfirm,
    });

    assert.doesNotThrow(() => deleteNode('mother-1'));
    assert.equal(nodes.has('mother-1'), false);
  } finally {
    (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm =
      previousConfirm;
  }
});
