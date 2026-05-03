/**
 * Purpose: FF-16 cleanup contract tests for stop-all side effects.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { executeStopAllCleanup } from './stop-all-cleanup.js';

test('executeStopAllCleanup clears media, sound, color, visual scenes, and node executors', () => {
  const calls: string[] = [];

  executeStopAllCleanup({
    media: {
      stopAllMedia: () => calls.push('media.stopAllMedia'),
      hideImage: () => calls.push('media.hideImage'),
      stopVideo: () => calls.push('media.stopVideo'),
    },
    sound: {
      stop: () => calls.push('sound.stop'),
    },
    modulatedSound: {
      stop: () => calls.push('modulatedSound.stop'),
    },
    screen: {
      clear: () => calls.push('screen.clear'),
      setColor: (payload) => calls.push(`screen.setColor:${payload.opacity}`),
    },
    visual: {
      clearScenes: () => calls.push('visual.clearScenes'),
      clearEffects: () => calls.push('visual.clearEffects'),
    },
    nodeExecutor: {
      stopAll: () => calls.push('nodeExecutor.stopAll'),
    },
  });

  assert.deepEqual(calls, [
    'media.stopAllMedia',
    'sound.stop',
    'modulatedSound.stop',
    'screen.clear',
    'screen.setColor:0',
    'visual.clearScenes',
    'visual.clearEffects',
    'nodeExecutor.stopAll',
  ]);
});
