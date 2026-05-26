// Purpose: Regression coverage for exporting URL Session -> QR image patches to Display runtimes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeRegistry, registerDefaultNodeDefinitions } from '@shugu/node-core';
import { exportGraphForPatch } from './patch-export';
import { assertPatchDeployableNodeType } from './engine-deployment-policy';
import type { GraphState, NodeInstance } from './types';

const node = (
  id: string,
  type: string,
  outputValues: Record<string, unknown> = {},
  inputValues: Record<string, unknown> = {}
): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues,
  outputValues,
});

const registry = new NodeRegistry();
registerDefaultNodeDefinitions(registry, {
  getClientId: () => null,
  getAllClientIds: () => [],
  getSelectedClientIds: () => [],
  executeCommand: () => {},
});

test('exportGraphForPatch snapshots URL Session output into URL to QR input', () => {
  const graph: GraphState = {
    nodes: [
      node('session', 'url-session', { url: 'https://fluffyfoundation.xyz/client?sessionId=abc' }),
      node('qr', 'url-to-qr-generator'),
      node('out', 'proc-show-image'),
    ],
    connections: [
      { id: 'url', sourceNodeId: 'session', sourcePortId: 'url', targetNodeId: 'qr', targetPortId: 'url' },
      { id: 'image', sourceNodeId: 'qr', sourcePortId: 'image', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), ['proc-show-image', 'url-to-qr-generator']);
  assert.equal(
    result.graph.nodes.find((item) => item.id === 'qr')?.inputValues.url,
    'https://fluffyfoundation.xyz/client?sessionId=abc'
  );
  assert.deepEqual(result.graph.connections.map((item) => item.id), ['image']);
});

test('url-to-qr-generator is deployable inside image patches', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('url-to-qr-generator'));
});
