/**
 * Purpose: Regression tests for Display control action execution.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { get, writable } from 'svelte/store';

import { createClearedDisplayScreenOverlayState } from '../display-screen-overlay';
import { createClearedDisplayTextOverlayState } from '../display-text-overlay';
import { createDisplayControlExecutor } from './control-executor';
import type { MultimediaCore } from '@shugu/multimedia-core';

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test('Display executor applies showText and hideText controls to the text overlay', () => {
  const textOverlay = writable(createClearedDisplayTextOverlayState());
  const visualScenes = writable([]);
  const visualEffects = writable([]);
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () => null,
    getNodeExecutor: () => null,
    screenOverlay: writable(createClearedDisplayScreenOverlayState()),
    textOverlay,
    visualScenes,
    visualEffects,
    isDev: false,
  });

  executor.executeControl('showText', { text: '你好', duration: 2500 });
  assert.deepEqual(get(textOverlay), {
    visible: true,
    text: '你好',
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    duration: 2500,
  });

  executor.executeControl('hideText', {});
  assert.deepEqual(get(textOverlay), createClearedDisplayTextOverlayState());
});

test('Display executor expands custom control-batch payloads', () => {
  const textOverlay = writable(createClearedDisplayTextOverlayState());
  const screenOverlay = writable(createClearedDisplayScreenOverlayState());
  const visualScenes = writable([]);
  const visualEffects = writable([]);
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () => null,
    getNodeExecutor: () => null,
    screenOverlay,
    textOverlay,
    visualScenes,
    visualEffects,
    isDev: false,
  });

  executor.executeControl('custom', {
    kind: 'control-batch',
    items: [
      { action: 'showText', payload: { text: 'Batch Display' } },
      { action: 'screenColor', payload: { color: '#112233', opacity: 0.5, mode: 'solid' } },
      { action: 'visualScenes', payload: { scenes: [{ type: 'box', color: '#445566' }] } },
    ],
  });

  assert.equal(get(textOverlay).text, 'Batch Display');
  assert.equal(get(screenOverlay).color, '#112233');
  assert.deepEqual(get(visualScenes), [
    { type: 'box', color: '#445566', showBackground: 0, audioSource: 'microphone' },
  ]);
});

test('Display executor applies visualEffects controls for post-processing effects', () => {
  const visualScenes = writable([]);
  const visualEffects = writable([]);
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () => null,
    getNodeExecutor: () => null,
    screenOverlay: writable(createClearedDisplayScreenOverlayState()),
    textOverlay: writable(createClearedDisplayTextOverlayState()),
    visualScenes,
    visualEffects,
    isDev: false,
  });

  executor.executeControl('visualEffects', {
    effects: [
      { type: 'ascii', cellSize: 9.6 },
      { type: 'convolution', preset: 'sharpen', mix: 2, bias: -2, scale: 0.05, normalize: false },
    ],
  });

  assert.deepEqual(get(visualEffects), [
    { type: 'ascii', cellSize: 10 },
    { type: 'convolution', preset: 'sharpen', mix: 1, bias: -1, normalize: false, scale: 0.1 },
  ]);
});

test('Display executor forwards remote asset image refs to MultimediaCore', async () => {
  let captured: Parameters<MultimediaCore['media']['showImage']>[0] | null = null;
  const visualScenes = writable([]);
  const visualEffects = writable([]);
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () =>
      ({
        media: {
          showImage: (payload: Parameters<MultimediaCore['media']['showImage']>[0]) => {
            captured = payload;
          },
        },
      }) as MultimediaCore,
    getNodeExecutor: () => null,
    screenOverlay: writable(createClearedDisplayScreenOverlayState()),
    textOverlay: writable(createClearedDisplayTextOverlayState()),
    visualScenes,
    visualEffects,
    isDev: false,
  });

  executor.executeControl('showImage', { url: 'asset:image-1#fit=cover' });
  await Promise.resolve();

  assert.deepEqual(captured, {
    url: 'asset:image-1',
    duration: undefined,
    fit: 'cover',
  });
});

test('Display executor forwards streaming data image frames without async blob conversion', async () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const shown: Array<Parameters<MultimediaCore['media']['showImage']>[0]> = [];
  let fetchCalls = 0;
  let objectUrlCalls = 0;

  globalThis.fetch = (() => {
    fetchCalls += 1;
    return Promise.resolve(new Response(new Blob(['unused'], { type: 'image/webp' })));
  }) as typeof fetch;
  URL.createObjectURL = (() => {
    objectUrlCalls += 1;
    return `blob:frame-${objectUrlCalls}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

  try {
    const visualScenes = writable([]);
    const visualEffects = writable([]);
    const executor = createDisplayControlExecutor({
      getMultimediaCore: () =>
        ({
          media: {
            showImage: (payload: Parameters<MultimediaCore['media']['showImage']>[0]) => {
              shown.push(payload);
            },
          },
        }) as MultimediaCore,
      getNodeExecutor: () => null,
      screenOverlay: writable(createClearedDisplayScreenOverlayState()),
      textOverlay: writable(createClearedDisplayTextOverlayState()),
      visualScenes,
      visualEffects,
      isDev: false,
    });

    executor.executeControl('showImage', { url: 'data:image/webp;base64,first' });
    executor.executeControl('showImage', { url: 'data:image/webp;base64,second' });

    await waitFor(() => shown.length === 2);

    assert.deepEqual(shown, [
      { url: 'data:image/webp;base64,first', duration: undefined },
      { url: 'data:image/webp;base64,second', duration: undefined },
    ]);
    assert.equal(fetchCalls, 0);
    assert.equal(objectUrlCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('Display executor stopMedia stops playback media without hiding the active image', () => {
  const calls: string[] = [];
  const visualScenes = writable([]);
  const visualEffects = writable([]);
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () =>
      ({
        media: {
          stopVideo: () => {
            calls.push('stopVideo');
          },
          stopAudio: () => {
            calls.push('stopAudio');
          },
          hideImage: () => {
            calls.push('hideImage');
          },
          stopAllMedia: () => {
            calls.push('stopAllMedia');
          },
        },
      }) as unknown as MultimediaCore,
    getNodeExecutor: () => null,
    screenOverlay: writable(createClearedDisplayScreenOverlayState()),
    textOverlay: writable(createClearedDisplayTextOverlayState()),
    visualScenes,
    visualEffects,
    isDev: false,
  });

  executor.executeControl('stopMedia', {});

  assert.deepEqual(calls, ['stopVideo', 'stopAudio']);
});
