/**
 * Purpose: Verify pure Node Graph import execution emits server-sync snapshots.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NodeRegistry, type NodeDefinition } from '@shugu/node-core';
import type { GraphState } from '$lib/nodes/types';
import type { NodeGroup } from '../controllers/group-controller';
import { executeParsedNodeGraphImport } from './node-graph-import-executor.js';
import { parseNodeGraphFile } from './node-graph-file.js';

function registryWith(type: string): NodeRegistry {
  const registry = new NodeRegistry();
  const definition: NodeDefinition = {
    type,
    label: type,
    category: 'Test',
    inputs: [],
    outputs: [],
    configSchema: [],
    process: () => ({}),
  };
  registry.register(definition);
  return registry;
}

function registryWithTypes(types: string[]): NodeRegistry {
  const registry = new NodeRegistry();
  for (const type of types) {
    registry.register({
      type,
      label: type,
      category: 'Test',
      inputs: [],
      outputs: [],
      configSchema: [],
      process: () => ({}),
    });
  }
  return registry;
}

test('executeParsedNodeGraphImport notifies with complete graph and remapped AI Space groups', async () => {
  const graph: GraphState = { nodes: [], connections: [] };
  let groups: NodeGroup[] = [];
  let imported: { graph: GraphState; groups: NodeGroup[] } | null = null;

  const result = await executeParsedNodeGraphImport({
    parsedFile: {
      graph: {
        nodes: [
          {
            id: 'source-node',
            type: 'string',
            position: { x: 0, y: 0 },
            config: { value: 'hello' },
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [
        {
          id: 'source-ai',
          parentId: null,
          kind: 'ai-space',
          name: 'AI Space',
          nodeIds: ['source-node'],
          disabled: false,
          minimized: false,
          agentPolicy: { enabled: true },
          agentInterface: { eventBindings: ['client.text.final'] },
        } as NodeGroup,
      ],
      collapsedNodeIds: [],
    },
    nodeRegistry: registryWith('string'),
    nodeEngine: {
      exportGraph: () => ({
        nodes: graph.nodes.map((node) => ({ ...node })),
        connections: graph.connections.map((connection) => ({ ...connection })),
      }),
      addNode: (node) => {
        graph.nodes.push(node);
      },
      addConnection: (connection) => {
        graph.connections.push(connection);
        return true;
      },
      updateNodeConfig: () => undefined,
    },
    getNodeGroups: () => groups,
    appendNodeGroups: (next) => {
      groups = [...groups, ...next];
    },
    getViewportCenterGraphPos: () => ({ x: 0, y: 0 }),
    createId: (prefix) => `${prefix}fixed`,
    onGraphImported: (snapshot) => {
      imported = snapshot;
    },
  });

  assert.equal(result.importedNodes, 1);
  assert.ok(imported);
  assert.equal(imported.graph.nodes.length, 1);
  assert.equal(imported.groups.length, 1);
  assert.equal(imported.groups[0].kind, 'ai-space');
  assert.equal(imported.groups[0].nodeIds[0], imported.graph.nodes[0].id);
});

test('executeParsedNodeGraphImport can import the AI agent demo template without skips', async () => {
  const repoRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../../../..'
  );
  const parsed = JSON.parse(
    readFileSync(join(repoRoot, 'docs/templates/ai-agent-demo-template.json'), 'utf8')
  );
  const registry = registryWithTypes([
    'note',
    'string',
    'show-anything',
    'proc-display-text',
    'client-count',
    'number',
    'client-loader',
    'client-executor',
    'proc-flashlight',
    'proc-screen-color',
    'display-object',
    'cmd-aggregator',
  ]);
  const graph: GraphState = { nodes: [], connections: [] };
  const connectedInputs = new Set<string>();
  let importedGroups: NodeGroup[] = [];

  const parsedFile = parseNodeGraphFile(parsed);
  assert.ok(parsedFile);

  const result = await executeParsedNodeGraphImport({
    parsedFile,
    nodeRegistry: registry,
    nodeEngine: {
      exportGraph: () => ({
        nodes: graph.nodes.map((node) => ({ ...node })),
        connections: graph.connections.map((connection) => ({ ...connection })),
      }),
      addNode: (node) => {
        graph.nodes.push(node);
      },
      addConnection: (connection) => {
        const key = `${connection.targetNodeId}:${connection.targetPortId}`;
        if (connectedInputs.has(key)) return false;
        connectedInputs.add(key);
        graph.connections.push(connection);
        return true;
      },
      updateNodeConfig: (nodeId, config) => {
        const node = graph.nodes.find((candidate) => candidate.id === nodeId);
        if (node) node.config = { ...(node.config ?? {}), ...config };
      },
    },
    getNodeGroups: () => [],
    appendNodeGroups: (next) => {
      importedGroups = next;
    },
    getViewportCenterGraphPos: () => ({ x: 0, y: 0 }),
    createId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
  });

  assert.equal(result.skippedNodes, 0);
  assert.equal(result.skippedConnections, 0);
  assert.equal(importedGroups.length, 1);
  assert.equal(importedGroups[0].kind, 'ai-space');
  assert.equal(importedGroups[0].agentPolicy?.enabled, true);
  assert.equal(importedGroups[0].agentInterface?.eventBindings?.includes('client.text.final'), true);
});

test('executeParsedNodeGraphImport restores embedded custom node definitions before importing nodes', async () => {
  const graph: GraphState = { nodes: [], connections: [] };
  const registry = registryWithTypes(['custom:def-1']);
  let addedDefinition: unknown = null;
  let importedGraph: GraphState | null = null;

  const result = await executeParsedNodeGraphImport({
    parsedFile: {
      graph: {
        nodes: [
          {
            id: 'custom-node',
            type: 'custom:def-1',
            position: { x: 0, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [],
      customNodes: [
        {
          definitionId: 'def-1',
          name: 'Nested',
          template: { nodes: [], connections: [] },
          ports: [],
        },
      ],
      collapsedNodeIds: [],
    },
    nodeRegistry: registry,
    nodeEngine: {
      exportGraph: () => ({
        nodes: graph.nodes.map((node) => ({ ...node })),
        connections: graph.connections.map((connection) => ({ ...connection })),
      }),
      addNode: (node) => {
        graph.nodes.push(node);
      },
      addConnection: (connection) => {
        graph.connections.push(connection);
        return true;
      },
      updateNodeConfig: () => undefined,
    },
    getNodeGroups: () => [],
    appendNodeGroups: () => undefined,
    getViewportCenterGraphPos: () => ({ x: 0, y: 0 }),
    createId: (prefix) => `${prefix}fixed`,
    addCustomNodeDefinition: (definition) => {
      addedDefinition = definition;
    },
    onGraphImported: (snapshot) => {
      importedGraph = snapshot.graph;
    },
  });

  assert.equal(result.importedNodes, 1);
  assert.ok(addedDefinition);
  assert.ok(importedGraph);
  assert.equal(importedGraph?.nodes[0].type, 'custom:def-1');
});

test('executeParsedNodeGraphImport migrates legacy direct TTS audio chains to explicit asset playback', async () => {
  const graph: GraphState = { nodes: [], connections: [] };
  const registry = registryWithTypes([
    'generate-tts-audio',
    'load-audio-from-assets',
    'tone-pitch',
    'audio-out',
  ]);
  let seq = 0;

  const result = await executeParsedNodeGraphImport({
    parsedFile: {
      graph: {
        nodes: [
          {
            id: 'tts',
            type: 'generate-tts-audio',
            position: { x: 0, y: 0 },
            config: {},
            inputValues: { text: 'hello' },
            outputValues: {},
          },
          {
            id: 'pitch',
            type: 'tone-pitch',
            position: { x: 180, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
          {
            id: 'out',
            type: 'audio-out',
            position: { x: 360, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [
          { id: 'legacy', sourceNodeId: 'tts', sourcePortId: 'audio', targetNodeId: 'pitch', targetPortId: 'in' },
          { id: 'out', sourceNodeId: 'pitch', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
        ],
      },
      groups: [],
      collapsedNodeIds: [],
    },
    nodeRegistry: registry,
    nodeEngine: {
      exportGraph: () => ({
        nodes: graph.nodes.map((node) => ({ ...node })),
        connections: graph.connections.map((connection) => ({ ...connection })),
      }),
      addNode: (node) => {
        graph.nodes.push(node);
      },
      addConnection: (connection) => {
        graph.connections.push(connection);
        return true;
      },
      updateNodeConfig: () => undefined,
    },
    getNodeGroups: () => [],
    appendNodeGroups: () => undefined,
    getViewportCenterGraphPos: () => ({ x: 0, y: 0 }),
    createId: (prefix) => `${prefix}${++seq}`,
  });

  assert.equal(result.skippedConnections, 0);
  const tts = graph.nodes.find((node) => node.type === 'generate-tts-audio');
  const load = graph.nodes.find((node) => node.type === 'load-audio-from-assets');
  const pitch = graph.nodes.find((node) => node.type === 'tone-pitch');
  assert.ok(tts);
  assert.ok(load);
  assert.ok(pitch);
  assert.ok(
    graph.connections.some(
      (connection) =>
        connection.sourceNodeId === tts.id &&
        connection.sourcePortId === 'asset' &&
        connection.targetNodeId === load.id &&
        connection.targetPortId === 'asset'
    )
  );
  assert.ok(
    graph.connections.some(
      (connection) =>
        connection.sourceNodeId === load.id &&
        connection.sourcePortId === 'ref' &&
        connection.targetNodeId === pitch.id &&
        connection.targetPortId === 'in'
    )
  );
});
