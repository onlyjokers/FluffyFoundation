/**
 * Purpose: Regression tests for client visual overlay stacking order.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const visualCanvasSource = () => readFileSync(new URL('./VisualCanvas.svelte', import.meta.url), 'utf8');
const imageDisplaySource = () => readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');
const clientUiSource = () => readFileSync(new URL('./ClientUiLayer.svelte', import.meta.url), 'utf8');
const pageSource = () => readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const videoPlayerSource = () =>
  readFileSync(
    new URL('../../../../../packages/ui-kit/src/components/VideoPlayer.svelte', import.meta.url),
    'utf8'
  );

test('client visual overlays follow Effect > Static UI > Display Text > Video > Image > Scene', () => {
  assert.match(visualCanvasSource(), /--layer-scene-base:\s*4;/);
  assert.match(imageDisplaySource(), /z-index:\s*var\(--layer-image\);/);
  assert.match(videoPlayerSource(), /z-index:\s*var\(--layer-video\);/);
  assert.match(pageSource(), /z-index:\s*var\(--layer-display-text\);/);
  assert.match(clientUiSource(), /z-index:\s*var\(--layer-static-ui\);/);
  assert.match(visualCanvasSource(), /--layer-effect:\s*28;/);
  assert.match(
    readFileSync(
      new URL('../../../../../packages/visual-plugins/src/scene-manager.ts', import.meta.url),
      'utf8'
    ),
    /zIndex\s*=\s*`calc\(var\(--layer-scene-base, 0\) \+ \$\{index\}\)`/
  );
});

test('client layer variables encode the requested visual priority', () => {
  const source = visualCanvasSource();
  const values = Object.fromEntries(
    Array.from(source.matchAll(/--layer-([a-z-]+):\s*(\d+);/g)).map((match) => [
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

test('visual effects do not hide higher visual layers', () => {
  const source = visualCanvasSource();

  assert.doesNotMatch(source, /setBaseLayerVisibility/);
  assert.doesNotMatch(source, /querySelectorAll\('\\.video-overlay, \\.image-overlay'\)/);
});

test('visual canvas container keeps a measurable viewport box without trapping the effect layer', () => {
  const source = visualCanvasSource();
  const visualContainerRule = source.match(/\.visual-container\s*\{[\s\S]*?\n  \}/)?.[0] ?? '';

  assert.match(visualContainerRule, /position:\s*fixed;/);
  assert.match(visualContainerRule, /width:\s*100%;/);
  assert.match(visualContainerRule, /height:\s*100%;/);
  assert.doesNotMatch(visualContainerRule, /display:\s*contents;/);
  assert.doesNotMatch(visualContainerRule, /z-index:/);
  assert.match(source, /<\/div>\s*<canvas class="effect-output"/);
});
