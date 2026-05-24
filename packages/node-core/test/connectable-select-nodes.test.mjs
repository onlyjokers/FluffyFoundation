// Purpose: Regression coverage for select-like config fields that are exposed as semantic input ports.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, registerDefaultNodeDefinitions } from '../dist-node-core/index.js';

function buildRegistry(deps = {}) {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: () => {},
    executeCommandForClientId: () => {},
    ...deps,
  });
  return registry;
}

function context(nodeId = 'node') {
  return { nodeId, time: 1000, deltaTime: 16 };
}

test('default runtime enum config fields expose allowed values on semantic inputs', () => {
  const registry = buildRegistry();
  const cases = [
    ['effect-convolution', 'preset'],
    ['audio-data', 'fftSize'],
    ['tone-lfo', 'waveform'],
    ['tone-osc', 'waveform'],
    ['proc-flashlight', 'mode'],
    ['proc-screen-color', 'waveform'],
    ['proc-synth-update', 'waveform'],
    ['math', 'operation'],
    ['number-script', 'loop'],
    ['scene-box', 'audioSource'],
    ['scene-mel', 'audioSource'],
    ['client-permission-filter', 'matchMode'],
    ['img-fit', 'fit'],
    ['load-video-from-assets', 'fit'],
    ['load-video-from-local', 'fit'],
    ['proc-push-image-upload', 'format'],
  ];

  for (const [type, inputId] of cases) {
    const definition = registry.get(type);
    assert.ok(definition, `${type} is registered`);
    const input = definition.inputs.find((item) => item.id === inputId);
    assert.ok(input, `${type}.${inputId} should be a semantic input`);
    assert.ok(Array.isArray(input.options) && input.options.length > 0, `${type}.${inputId} should expose allowed values`);
  }
});

test('config-only select fields use input values before config fallbacks', () => {
  const registry = buildRegistry({
    getAllClientIds: () => ['client-a', 'client-b'],
    getClientPermissions: (clientId) =>
      ({
        'client-a': { microphone: 'denied', camera: 'granted' },
        'client-b': { microphone: 'granted', camera: 'denied' },
      })[clientId] ?? null,
  });

  const imgFit = registry.get('img-fit');
  assert.ok(imgFit);
  assert.deepEqual(
    imgFit.process({ in: 'image:abc', fit: 'cover' }, { fit: 'contain' }, context('img-fit')),
    { out: 'image:abc#fit=cover' }
  );

  const videoAssets = registry.get('load-video-from-assets');
  assert.ok(videoAssets);
  assert.match(
    videoAssets.process(
      { fit: 'fill', play: true, loop: false, reverse: false, muted: false, volume: 1 },
      { assetId: 'clip-1', fit: 'contain' },
      context('video-assets')
    ).ref,
    /[&#]fit=fill$/
  );

  const videoLocal = registry.get('load-video-from-local');
  assert.ok(videoLocal);
  assert.match(
    videoLocal.process(
      { asset: '/tmp/clip.mp4', fit: 'cover', play: true, loop: false, reverse: false, muted: false, volume: 1 },
      { assetPath: '', fit: 'contain' },
      context('video-local')
    ).ref,
    /[&#]fit=cover$/
  );

  const permissionFilter = registry.get('client-permission-filter');
  assert.ok(permissionFilter);
  assert.deepEqual(
    permissionFilter.process(
      { matchMode: 'any' },
      { matchMode: 'all', microphone: true, camera: true },
      context('permission-filter')
    ).indexs,
    ['client-a', 'client-b']
  );

  const pushImage = registry.get('proc-push-image-upload');
  assert.ok(pushImage);
  const cmd = pushImage.process(
    { trigger: true, format: 'image/png' },
    { format: 'image/jpeg', quality: 0.8, maxWidth: 960, speed: 1 },
    context('push-image')
  ).cmd;
  assert.equal(cmd.payload.format, 'image/png');
});

test('remote asset loader nodes accept typed asset refs without double-prefixing', () => {
  const registry = buildRegistry();

  const videoAssets = registry.get('load-video-from-assets');
  assert.ok(videoAssets);
  const videoRef = videoAssets.process(
    { play: true, loop: false, reverse: false, muted: false, volume: 1 },
    { assetId: 'asset:clip-1' },
    context('video-assets-ref')
  ).ref;
  assert.match(videoRef, /^asset:clip-1#/);
  assert.doesNotMatch(videoRef, /^asset:asset:/);

  const imageAssets = registry.get('load-image-from-assets');
  assert.ok(imageAssets);
  assert.equal(
    imageAssets.process({}, { assetId: 'asset:image-1' }, context('image-assets-ref')).ref,
    'asset:image-1'
  );
});
