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

test('push image screenshot capture uses async canvas encoding', () => {
  const screenshotSource = readFileSync(new URL('./client-screenshot.ts', import.meta.url), 'utf8');

  assert.match(screenshotSource, /canvas\.toBlob\(/);
  assert.doesNotMatch(screenshotSource, /canvas\.toDataURL\(/);
});

test('push image screenshot capture is WebP-only for streaming frames', () => {
  const screenshotSource = readFileSync(new URL('./client-screenshot.ts', import.meta.url), 'utf8');

  assert.match(screenshotSource, /encodeCanvasToDataUrl/);
  assert.match(screenshotSource, /return 'image\/webp'/);
  assert.doesNotMatch(screenshotSource, /raw === 'image\/png'/);
  assert.doesNotMatch(screenshotSource, /raw === 'image\/jpeg'/);
  assert.doesNotMatch(screenshotSource, /const fallbacks/);
});

test('push image screenshot capture reuses a single canvas between frames', () => {
  const screenshotSource = readFileSync(new URL('./client-screenshot.ts', import.meta.url), 'utf8');

  assert.match(screenshotSource, /let captureCanvas: HTMLCanvasElement \| null = null/);
  assert.match(screenshotSource, /function getCaptureCanvas/);
  assert.match(screenshotSource, /captureCanvas = document\.createElement\('canvas'\)/);
  assert.doesNotMatch(screenshotSource, /const canvas = document\.createElement\('canvas'\)/);
});
