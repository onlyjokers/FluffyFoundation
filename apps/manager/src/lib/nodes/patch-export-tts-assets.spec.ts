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
      node('tts', 'generate-tts-audio', { assetId: 'asset-tts-1' }, { text: 'hello' }),
      node('drop', 'upload-audio-to-drop-box', {}),
      node(
        'ref',
        'reference-audio-from-drop-box',
        { assetId: 'asset-tts-1' },
        {},
        { asset: 'asset:asset-tts-1' }
      ),
      node('load', 'load-audio-from-assets', {}, { play: true }),
      node('out', 'audio-out'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'tts',
        sourcePortId: 'assetId',
        targetNodeId: 'drop',
        targetPortId: 'assetId',
      },
      {
        id: 'c2',
        sourceNodeId: 'ref',
        sourcePortId: 'asset',
        targetNodeId: 'load',
        targetPortId: 'asset',
      },
      {
        id: 'c3',
        sourceNodeId: 'load',
        sourcePortId: 'ref',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.assetRefs, ['asset:asset-tts-1']);
  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), [
    'audio-out',
    'load-audio-from-assets',
  ]);
  assert.deepEqual(
    result.graph.nodes.find((item) => item.id === 'load')?.config.assetId,
    'asset-tts-1'
  );
});

test('exportGraphForPatch uses explicit Generate TTS Audio asset into Load Audio From Remote chain', () => {
  const graph: GraphState = {
    nodes: [
      node(
        'tts',
        'generate-tts-audio',
        {},
        { text: 'hello', trigger: false },
        { asset: 'asset:asset-tts-1', assetId: 'asset-tts-1' }
      ),
      node('load', 'load-audio-from-assets', {}, { play: true }),
      node('pitch', 'tone-pitch'),
      node('out', 'audio-out'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'tts',
        sourcePortId: 'asset',
        targetNodeId: 'load',
        targetPortId: 'asset',
      },
      {
        id: 'c2',
        sourceNodeId: 'load',
        sourcePortId: 'ref',
        targetNodeId: 'pitch',
        targetPortId: 'in',
      },
      {
        id: 'c3',
        sourceNodeId: 'pitch',
        sourcePortId: 'out',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.assetRefs, ['asset:asset-tts-1']);
  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), [
    'audio-out',
    'load-audio-from-assets',
    'tone-pitch',
  ]);
  assert.equal(
    result.graph.nodes.some((item) => item.type === 'generate-tts-audio'),
    false
  );
  const load = result.graph.nodes.find((item) => item.id === 'load');
  assert.equal(load?.type, 'load-audio-from-assets');
  assert.equal(load?.config.assetId, 'asset-tts-1');
  assert.deepEqual(
    result.graph.connections
      .map((connection) => ({
        sourceNodeId: connection.sourceNodeId,
        sourcePortId: connection.sourcePortId,
        targetNodeId: connection.targetNodeId,
        targetPortId: connection.targetPortId,
      }))
      .sort((a, b) =>
        `${a.sourceNodeId}:${a.targetNodeId}`.localeCompare(`${b.sourceNodeId}:${b.targetNodeId}`)
      ),
    [
      { sourceNodeId: 'load', sourcePortId: 'ref', targetNodeId: 'pitch', targetPortId: 'in' },
      { sourceNodeId: 'pitch', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ]
  );
});

test('exportGraphForPatch resolves Load Audio Asset From Remote config into Load Audio From Remote', () => {
  const graph: GraphState = {
    nodes: [
      node('asset', 'load-audio-asset-from-assets', { assetId: 'asset:asset-remote-1' }),
      node('load', 'load-audio-from-assets', {}, { play: true }),
      node('out', 'audio-out'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'asset',
        sourcePortId: 'ref',
        targetNodeId: 'load',
        targetPortId: 'asset',
      },
      {
        id: 'c2',
        sourceNodeId: 'load',
        sourcePortId: 'ref',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.assetRefs, ['asset:asset-remote-1']);
  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), [
    'audio-out',
    'load-audio-from-assets',
  ]);
  assert.equal(
    result.graph.nodes.find((item) => item.id === 'load')?.config.assetId,
    'asset-remote-1'
  );
});

test('exportGraphForPatch uses explicit GPT Image Gen asset into Load Image From Remote chain', () => {
  const graph: GraphState = {
    nodes: [
      node(
        'image-gen',
        'gpt-image-gen',
        {},
        { prompt: 'a glass cube', trigger: false },
        {
          asset: 'asset:asset-image-1?v=3',
          assetId: 'asset-image-1',
          image: 'asset:asset-image-1?v=3',
        }
      ),
      node('load', 'load-image-from-assets'),
      node('scale', 'img-scale', {}, { scale: 1 }),
      node('out', 'proc-show-image'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'image-gen',
        sourcePortId: 'asset',
        targetNodeId: 'load',
        targetPortId: 'asset',
      },
      {
        id: 'c2',
        sourceNodeId: 'load',
        sourcePortId: 'ref',
        targetNodeId: 'scale',
        targetPortId: 'in',
      },
      {
        id: 'c3',
        sourceNodeId: 'scale',
        sourcePortId: 'out',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  };

  const result = exportGraphForPatch(graph, { rootNodeIds: ['out'], nodeRegistry: registry });

  assert.deepEqual(result.assetRefs, ['asset:asset-image-1']);
  assert.deepEqual(result.graph.nodes.map((item) => item.type).sort(), [
    'img-scale',
    'load-image-from-assets',
    'proc-show-image',
  ]);
  assert.equal(
    result.graph.nodes.some((item) => item.type === 'gpt-image-gen'),
    false
  );
  const load = result.graph.nodes.find((item) => item.id === 'load');
  assert.equal(load?.type, 'load-image-from-assets');
  assert.equal(load?.config.assetId, 'asset-image-1');
  assert.equal(load?.inputValues.asset, 'asset:asset-image-1?v=3');
  assert.deepEqual(
    result.graph.connections
      .map((connection) => ({
        sourceNodeId: connection.sourceNodeId,
        sourcePortId: connection.sourcePortId,
        targetNodeId: connection.targetNodeId,
        targetPortId: connection.targetPortId,
      }))
      .sort((a, b) =>
        `${a.sourceNodeId}:${a.targetNodeId}`.localeCompare(`${b.sourceNodeId}:${b.targetNodeId}`)
      ),
    [
      { sourceNodeId: 'load', sourcePortId: 'ref', targetNodeId: 'scale', targetPortId: 'in' },
      { sourceNodeId: 'scale', sourcePortId: 'out', targetNodeId: 'out', targetPortId: 'in' },
    ]
  );
});
