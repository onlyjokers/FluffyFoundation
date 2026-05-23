/**
 * Purpose: Regression tests for Display control action execution.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { get, writable } from 'svelte/store';

import { createClearedDisplayScreenOverlayState } from '../display-screen-overlay';
import { createClearedDisplayTextOverlayState } from '../display-text-overlay';
import { createDisplayControlExecutor } from './control-executor';

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
