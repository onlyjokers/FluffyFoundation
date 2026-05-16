/**
 * Purpose: Verify pure Node Graph import execution emits server-sync snapshots.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

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
