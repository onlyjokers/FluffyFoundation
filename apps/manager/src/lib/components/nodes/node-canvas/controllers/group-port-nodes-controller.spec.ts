// Purpose: Regression tests for Group port/proxy maintenance behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createGroupPortNodesController } from './group-port-nodes-controller';
import type { GraphState, NodeInstance, Connection } from '$lib/nodes/types';

function createHarness(initialGraph: GraphState) {
  let graph: GraphState = {
    nodes: [...(initialGraph.nodes ?? [])],
    connections: [...(initialGraph.connections ?? [])],
  };
  let nextNodeIndex = 1;

  const nodeEngine = {
    exportGraph: () => graph,
    getNode: (nodeId: string) => graph.nodes.find((node) => String(node.id) === String(nodeId)),
    addNode: (node: NodeInstance) => {
      graph = { ...graph, nodes: [...graph.nodes, node] };
    },
    removeNode: (nodeId: string) => {
      const id = String(nodeId);
      graph = {
        nodes: graph.nodes.filter((node) => String(node.id) !== id),
        connections: graph.connections.filter(
          (conn) => String(conn.sourceNodeId) !== id && String(conn.targetNodeId) !== id
        ),
      };
    },
    addConnection: (connection: Connection) => {
      graph = { ...graph, connections: [...graph.connections, connection] };
      return true;
    },
    removeConnection: (connectionId: string) => {
      const id = String(connectionId);
      graph = {
        ...graph,
        connections: graph.connections.filter((conn) => String(conn.id) !== id),
      };
    },
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => {
      const id = String(nodeId);
      graph = {
        ...graph,
        nodes: graph.nodes.map((node) =>
          String(node.id) === id ? { ...node, config: { ...(node.config ?? {}), ...config } } : node
        ),
      };
    },
    updateNodePosition: () => undefined,
    lastError: { set: () => undefined },
  };

  const groupController = {
    nodeGroups: writable([
      {
        id: 'group-1',
        parentId: null,
        name: 'Group',
        nodeIds: ['inside'],
        disabled: false,
        minimized: false,
      },
    ]),
    groupFrames: writable([
      {
        group: {
          id: 'group-1',
          parentId: null,
          name: 'Group',
          nodeIds: ['inside'],
          disabled: false,
          minimized: false,
        },
        left: 100,
        top: 100,
        width: 300,
        height: 200,
        effectiveDisabled: false,
        depth: 0,
      },
    ]),
    beginProgrammaticTranslate: () => undefined,
    endProgrammaticTranslate: () => undefined,
    setRuntimeActiveByGroupId: () => undefined,
  };

  const controller = createGroupPortNodesController({
    nodeEngine: nodeEngine as never,
    nodeRegistry: {
      get: (type: string) => ({
        type,
        category: 'Test',
        name: type,
        configSchema: [],
        inputs: [{ id: 'value', type: 'number' }],
        outputs: [{ id: 'value', type: 'number' }],
        compute: () => ({}),
      }),
    } as never,
    adapter: {
      getNodeBounds: () => null,
      getNodePosition: () => null,
      setNodePosition: () => undefined,
    } as never,
    groupController: groupController as never,
    getNodeCount: () => graph.nodes.length,
    generateId: () => `node-${nextNodeIndex++}`,
  });

  return { controller, getGraph: () => graph };
}

test('normalizing proxies does not create collapsed sockets for plain cross-group connections', () => {
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame;

  try {
    const { controller, getGraph } = createHarness({
      nodes: [
        {
          id: 'outside',
          type: 'number',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'inside',
          type: 'number',
          position: { x: 200, y: 200 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'conn-1',
          sourceNodeId: 'outside',
          sourcePortId: 'value',
          targetNodeId: 'inside',
          targetPortId: 'value',
        },
      ],
    });

    controller.scheduleNormalizeProxies();

    assert.deepEqual(
      getGraph().nodes.map((node) => String(node.type)),
      ['number', 'number']
    );
    assert.deepEqual(getGraph().connections.map((conn) => String(conn.id)), ['conn-1']);
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
  }
});
