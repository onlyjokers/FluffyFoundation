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
  const executor = createDisplayControlExecutor({
    getMultimediaCore: () => null,
    getNodeExecutor: () => null,
    screenOverlay: writable(createClearedDisplayScreenOverlayState()),
    textOverlay,
    visualScenes,
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
