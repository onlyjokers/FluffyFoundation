// Purpose: Regression coverage for exporting generated TTS asset refs into client audio patches.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeRegistry, registerDefaultNodeDefinitions } from '@shugu/node-core';
import { exportGraphForPatch } from './patch-export';
import type { GraphState, NodeInstance } from './types';

const node = (
  id: string,
  type: string,
  config: Record<string, unknown> = {},
  inputValues: Record<string, unknown> = {},
  outputValues: Record<string, unknown> = {}
): NodeInstance => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
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

test('exportGraphForPatch includes referenced TTS audio asset but not manager-only generation nodes', () => {
  const graph: GraphState = {
    nodes: [
      node('tts', 'generate-tts-audio-asset', { assetId: 'asset-tts-1' }, { text: 'hello' }),
      node('drop', 'upload-audio-to-drop-box', {}),
      node('ref', 'reference-audio-from-drop-box', { assetId: 'asset-tts-1' }, {}, { asset: 'asset:asset-tts-1' }),
      node('load', 'load-audio-from-assets', {}, { play: true }),
      node('out', 'audio-out'),
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'tts', sourcePortId: 'assetId', targetNodeId: 'drop', targetPortId: 'assetId' },
      { id: 'c2', sourceNodeId: 'ref', sourcePortId: 'asset', targetNodeId: 'load', targetPortId: 'asset' },
      { id: 'c3', sourceNodeId: 'load', sourcePortId: 'ref', targetNodeId: 'out', targetPortId: 'in' },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.assetRefs, ['asset:asset-tts-1']);
  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), ['audio-out', 'load-audio-from-assets']);
  assert.deepEqual(result.graph.nodes.find((item) => item.id === 'load')?.config.assetId, 'asset-tts-1');
});
