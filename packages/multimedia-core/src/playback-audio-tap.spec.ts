/**
 * Purpose: Regression coverage for playback audio analysis tap source selection.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearPlaybackAudioTapSource,
  clearPlaybackOutputAudioTapSource,
  setPlaybackAudioTapSource,
  setPlaybackOutputAudioTapSource,
  subscribePlaybackAudioTap,
} from './playback-audio-tap.js';

function collectTapEvents(): {
  events: Array<{ source: unknown; context: unknown }>;
  unsubscribe: () => void;
} {
  const events: Array<{ source: unknown; context: unknown }> = [];
  const unsubscribe = subscribePlaybackAudioTap((source, context) => {
    events.push({ source, context });
  });
  return { events, unsubscribe };
}

test('playback tap falls back to output source after a specific source clears', () => {
  clearPlaybackAudioTapSource();
  clearPlaybackOutputAudioTapSource();
  const outputSource = { id: 'output' } as unknown as AudioNode;
  const outputContext = { id: 'output-context' } as unknown as AudioContext;
  const specificSource = { id: 'specific' } as unknown as AudioNode;
  const specificContext = { id: 'specific-context' } as unknown as AudioContext;
  const { events, unsubscribe } = collectTapEvents();

  setPlaybackOutputAudioTapSource(outputSource, outputContext);
  setPlaybackAudioTapSource(specificSource, specificContext);
  clearPlaybackAudioTapSource(specificSource);

  assert.deepEqual(events, [
    { source: null, context: null },
    { source: outputSource, context: outputContext },
    { source: specificSource, context: specificContext },
    { source: outputSource, context: outputContext },
  ]);

  unsubscribe();
  clearPlaybackAudioTapSource();
  clearPlaybackOutputAudioTapSource();
});

test('playback tap keeps source and context paired', () => {
  clearPlaybackAudioTapSource();
  clearPlaybackOutputAudioTapSource();
  const outputSource = { id: 'output' } as unknown as AudioNode;
  const outputContext = { id: 'output-context' } as unknown as AudioContext;
  const specificSource = { id: 'specific' } as unknown as AudioNode;
  const { events, unsubscribe } = collectTapEvents();

  setPlaybackOutputAudioTapSource(outputSource, outputContext);
  setPlaybackAudioTapSource(specificSource, null);

  assert.deepEqual(events, [
    { source: null, context: null },
    { source: outputSource, context: outputContext },
    { source: specificSource, context: null },
  ]);

  unsubscribe();
  clearPlaybackAudioTapSource();
  clearPlaybackOutputAudioTapSource();
});
