/**
 * Purpose: Static regression tests for Display image overlay update behavior.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('display image overlay skips preloading for streaming blob and data image frames', () => {
  const source = readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');

  assert.match(source, /isStreamingFrameUrl/);
  assert.match(source, /url\.startsWith\('blob:'\)/);
  assert.match(source, /url\.startsWith\('data:image\/'\)/);
  assert.doesNotMatch(source, /\{#key activeUrl\}/);
});
