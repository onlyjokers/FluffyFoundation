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
    'client-object',
    'proc-flashlight',
    'proc-screen-color',
    'display-object',
    'cmd-aggregator',
  ]);
  const graph: GraphState = { nodes: [], connections: [] };
  const connectedInputs = new Set<string>();
  let importedGroups: NodeGroup[] = [];

  const result = await executeParsedNodeGraphImport({
    parsedFile: parsed,
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
