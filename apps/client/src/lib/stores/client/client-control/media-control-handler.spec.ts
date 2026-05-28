// Purpose: Regression tests for client media control asset reference handling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MultimediaCore } from '@shugu/multimedia-core';

import { executeMediaControl } from './media-control-handler';
import type { ClientControlDeps } from './types';

type CapturedImagePayload = Parameters<MultimediaCore['media']['showImage']>[0];

function depsWithMediaCore(core: Partial<MultimediaCore>): ClientControlDeps {
  return {
    getSDK: () => null,
    getSensorManager: () => null,
    getFlashlightController: () => null,
    getScreenController: () => null,
    getVibrationController: () => null,
    getToneSoundPlayer: () => null,
    getToneModulatedSoundPlayer: () => null,
    getNodeExecutor: () => null,
    getMultimediaCore: () => core as MultimediaCore,
  };
}

test('showImage forwards asset refs to MultimediaCore instead of pre-resolving them', () => {
  let captured: CapturedImagePayload | null = null;
  const core = {
    resolveAssetRef: (ref: string) => `https://server.test/${ref}`,
    media: {
      showImage: (payload: CapturedImagePayload) => {
        captured = payload;
      },
    },
  } as Partial<MultimediaCore>;

  const handled = executeMediaControl(
    depsWithMediaCore(core),
    'showImage',
    { url: 'asset:image-1#fit=cover&scale=1.5' },
    0
  );

  assert.equal(handled, true);
  assert.deepEqual(captured, {
    url: 'asset:image-1',
    fit: 'cover',
    scale: 1.5,
    duration: undefined,
  });
});

test('showImage refreshes an already displayed asset when the manifest checksum changes', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new ArrayBuffer(1), { status: 200 })) as typeof fetch;
  const entry = (value: string) => ({
    id: 'image-1',
    checksum: { algorithm: 'sha256', value },
    mimeType: 'image/png',
    kind: 'image',
    sizeBytes: 4,
    variants: [],
    cachePolicy: { strategy: 'revalidate' },
    permissions: { scope: 'server-deliverable' },
  });
  const core = new MultimediaCore({
    serverUrl: 'https://server.test',
    timeoutMs: 20,
    maxRetries: 0,
    autoStart: false,
  });

  try {
    core.setAssetManifest({
      manifestId: 'manifest-image-a',
      updatedAt: 100,
      assets: ['asset:image-1'],
      entries: [entry('a'.repeat(64))],
    });
    executeMediaControl(depsWithMediaCore(core), 'showImage', { url: 'asset:image-1' }, 0);

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'a'.repeat(64)}`
    );

    core.setAssetManifest({
      manifestId: 'manifest-image-b',
      updatedAt: 200,
      assets: ['asset:image-1'],
      entries: [entry('b'.repeat(64))],
    });

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'b'.repeat(64)}`
    );
  } finally {
    core.destroy();
    globalThis.fetch = originalFetch;
  }
});
