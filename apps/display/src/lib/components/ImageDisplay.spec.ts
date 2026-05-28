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

test('display image overlay drops stale streaming frames while a frame is decoding', () => {
  const source = readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');

  assert.match(source, /let pendingStreamingUrl: string \| null = null/);
  assert.match(source, /let streamingFrameLoading = false/);
  assert.match(source, /promotePendingStreamingFrame/);
  assert.match(source, /pendingStreamingUrl = url/);
});

test('display image overlay releases streaming decode state if the image event is missed', () => {
  const source = readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');

  assert.match(source, /let streamingFrameDecodeTimeoutId: ReturnType<typeof setTimeout> \| null = null/);
  assert.match(source, /scheduleStreamingFrameDecodeWatchdog/);
  assert.match(source, /clearStreamingFrameDecodeWatchdog/);
});
