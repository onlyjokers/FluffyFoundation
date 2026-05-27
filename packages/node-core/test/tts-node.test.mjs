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
    generate.process({ text: 'hello', trigger: true }, {}, context),
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

test('generate TTS audio asset exposes pulse trigger and connectable option inputs', () => {
  const calls = [];
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    audioAssets: {
      getTtsAudioAsset: (request) => {
        calls.push(request);
        return 'asset-tts-options';
      },
    },
  });

  const node = registry.get('generate-tts-audio-asset');
  assert.ok(node);

  assert.deepEqual(
    node.inputs.map((input) => [input.id, input.type, input.options?.map((option) => option.value)]),
    [
      ['text', 'string', undefined],
      ['trigger', 'pulse', undefined],
      ['model', 'string', ['qwen3-tts-flash']],
      ['voice', 'string', ['Cherry', 'Chelsie', 'Serena', 'Ethan']],
      ['languageType', 'string', ['Chinese', 'English', 'Japanese', 'Korean']],
      ['instructions', 'string', undefined],
      ['optimizeInstructions', 'boolean', undefined],
    ]
  );

  for (const key of ['model', 'voice', 'languageType']) {
    const field = node.configSchema.find((item) => item.key === key);
    assert.equal(field?.type, 'select');
    assert.equal(field?.connectable, true);
    assert.ok(Array.isArray(field?.options) && field.options.length > 0);
  }

  const result = node.process(
    {
      text: 'hello',
      trigger: true,
      model: 'qwen3-tts-flash',
      voice: 'Serena',
      languageType: 'English',
      instructions: 'Speak warmly.',
      optimizeInstructions: true,
    },
    {
      model: 'ignored-model',
      voice: 'Cherry',
      languageType: 'Chinese',
      instructions: 'Ignored instructions.',
      optimizeInstructions: false,
    },
    { nodeId: 'tts-option-inputs', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(result, { assetId: 'asset-tts-options', asset: 'asset:asset-tts-options' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'qwen3-tts-flash');
  assert.equal(calls[0].voice, 'Serena');
  assert.equal(calls[0].languageType, 'English');
  assert.equal(calls[0].instructions, 'Speak warmly.');
  assert.equal(calls[0].optimizeInstructions, true);
});
