import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('push image screenshot capture can find CameraScene video elements', () => {
  const screenshotSource = readFileSync(new URL('./client-screenshot.ts', import.meta.url), 'utf8');
  const cameraSceneSource = readFileSync(
    new URL('../../../../../../packages/visual-plugins/src/camera-scene.ts', import.meta.url),
    'utf8'
  );

  assert.match(cameraSceneSource, /classList\.add\('shugu-scene-canvas'\)/);
  assert.match(screenshotSource, /video\.shugu-scene-canvas\[data-shugu-scene-id="front-camera-scene"\]/);
  assert.match(screenshotSource, /video\.shugu-scene-canvas\[data-shugu-scene-id="back-camera-scene"\]/);
});
