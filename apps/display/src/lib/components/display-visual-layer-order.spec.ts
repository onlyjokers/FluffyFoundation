/**
 * Purpose: Regression tests for Display visual overlay stacking order.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const pageSource = () => readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const imageDisplaySource = () => readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');
const scenesSource = () => readFileSync(new URL('./DisplayVisualScenes.svelte', import.meta.url), 'utf8');
const effectsSource = () => readFileSync(new URL('./DisplayVisualEffects.svelte', import.meta.url), 'utf8');
const videoPlayerSource = () =>
  readFileSync(
    new URL('../../../../../packages/ui-kit/src/components/VideoPlayer.svelte', import.meta.url),
    'utf8'
  );

test('display visual overlays follow Effect > Static UI > Display Text > Video > Image > Scene', () => {
  assert.match(pageSource(), /--layer-scene-base:\s*4;/);
  assert.match(scenesSource(), /z-index:\s*var\(--layer-scene-base\);/);
  assert.match(imageDisplaySource(), /z-index:\s*var\(--layer-image\);/);
  assert.match(videoPlayerSource(), /z-index:\s*var\(--layer-video\);/);
  assert.match(pageSource(), /z-index:\s*var\(--layer-display-text\);/);
  assert.match(effectsSource(), /z-index:\s*var\(--layer-effect\);/);
});

test('display layer variables encode the requested visual priority', () => {
  const values = Object.fromEntries(
    Array.from(pageSource().matchAll(/--layer-([a-z-]+):\s*(\d+);/g)).map((match) => [
      match[1],
      Number(match[2]),
    ])
  );

  assert.equal(values.effect, 28);
  assert.equal(values['static-ui'], 24);
  assert.equal(values['display-text'], 20);
  assert.equal(values.video, 16);
  assert.equal(values.image, 12);
  assert.equal(values['scene-base'], 4);
});

test('display visual effects do not hide video, image, or scene base layers', () => {
  const source = effectsSource();

  assert.doesNotMatch(source, /setBaseLayerVisibility/);
  assert.doesNotMatch(source, /querySelectorAll\('\\.display-visual-scenes, \\.video-overlay, \\.image-overlay'\)/);
});

test('display page forwards image transform controls to the image overlay', () => {
  const source = pageSource();

  assert.match(source, /scale=\{\$imageState\.scale\}/);
  assert.match(source, /offsetX=\{\$imageState\.offsetX\}/);
  assert.match(source, /offsetY=\{\$imageState\.offsetY\}/);
  assert.match(source, /opacity=\{\$imageState\.opacity\}/);
});
