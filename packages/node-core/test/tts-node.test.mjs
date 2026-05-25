/**
 * Purpose: Unit tests for the asset-first TTS node definitions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, registerDefaultNodeDefinitions } from '../dist-node-core/index.js';

function buildRegistry() {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: () => {},
    executeCommandForClientId: () => {},
    audioAssets: {
      getTtsAudioAsset: () => 'asset-tts-1',
      uploadAudioToDropBox: ({ assetId }) => assetId,
      referenceAudioFromDropBox: ({ assetId }) => assetId ?? 'asset-tts-1',
    },
  });
  return registry;
}

test('legacy aliyun-tts node is not registered in the default catalog', () => {
  const registry = buildRegistry();
  const def = registry.get('aliyun-tts');
  assert.equal(def, undefined);
});

test('asset-first TTS nodes expose asset-id refs for the Load Audio From Assets chain', () => {
  const registry = buildRegistry();
  const generate = registry.get('generate-tts-audio-asset');
  const upload = registry.get('upload-audio-to-drop-box');
  const reference = registry.get('reference-audio-from-drop-box');

  assert.ok(generate, 'expected generate-tts-audio-asset definition');
  assert.ok(upload, 'expected upload-audio-to-drop-box definition');
  assert.ok(reference, 'expected reference-audio-from-drop-box definition');

  assert.deepEqual(
    generate.outputs.map((output) => ({ id: output.id, type: output.type })),
    [
      { id: 'assetId', type: 'string' },
      { id: 'asset', type: 'asset' },
    ]
  );
  assert.deepEqual(upload.inputs.map((input) => ({ id: input.id, type: input.type })), [
    { id: 'assetId', type: 'string' },
    { id: 'asset', type: 'asset' },
  ]);
  assert.deepEqual(reference.outputs.map((output) => ({ id: output.id, type: output.type })), [
    { id: 'assetId', type: 'string' },
    { id: 'asset', type: 'asset' },
  ]);

  const context = { nodeId: 'tts', time: 0, deltaTime: 0 };
  assert.deepEqual(
    generate.process({ text: 'hello' }, {}, context),
    { assetId: 'asset-tts-1', asset: 'asset:asset-tts-1' }
  );
  assert.deepEqual(
    upload.process({ assetId: 'asset-tts-1' }, {}, context),
    { assetId: 'asset-tts-1', asset: 'asset:asset-tts-1' }
  );
  assert.deepEqual(
    reference.process({}, { assetId: 'asset-tts-1' }, context),
    { assetId: 'asset-tts-1', asset: 'asset:asset-tts-1' }
  );
});
