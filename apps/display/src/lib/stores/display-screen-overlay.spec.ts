/**
 * Purpose: FF-18 GS-13 tests for Display screenColor overlay state and modulation sampling.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDisplayScreenOverlayState,
  sampleDisplayScreenOverlay,
  createClearedDisplayScreenOverlayState,
  getDisplayScreenOverlayNow,
} from './display-screen-overlay';

test('creates static Display overlay state for solid screenColor payloads', () => {
  const state = createDisplayScreenOverlayState({ mode: 'solid', color: '#3366ff', opacity: 0.6 }, 1000);
  const sample = sampleDisplayScreenOverlay(state, 1200);

  assert.equal(state.effect, null);
  assert.deepEqual(sample, { visible: true, color: '#3366ff', opacity: 0.6 });
});

test('samples breathing-like Display overlay changes for modulate screenColor payloads', () => {
  const state = createDisplayScreenOverlayState(
    {
      mode: 'modulate',
      color: '#000000',
      secondaryColor: '#ffffff',
      opacity: 1,
      minOpacity: 0.2,
      maxOpacity: 1,
      frequencyHz: 1,
      waveform: 'sine',
    },
    0
  );

  const start = sampleDisplayScreenOverlay(state, 0);
  const quarter = sampleDisplayScreenOverlay(state, 250);
  const half = sampleDisplayScreenOverlay(state, 500);

  assert.equal(state.effect?.mode, 'modulate');
  assert.notEqual(start.color, quarter.color);
  assert.notEqual(quarter.color, half.color);
  assert.ok(quarter.opacity > start.opacity, 'quarter-cycle opacity should rise');
  assert.ok(half.opacity < quarter.opacity, 'half-cycle opacity should fall after peak');
});

test('uses a monotonic overlay clock compatible with animation frame timestamps', () => {
  const now = getDisplayScreenOverlayNow();
  const state = createDisplayScreenOverlayState(
    {
      mode: 'modulate',
      color: '#000000',
      secondaryColor: '#ffffff',
      minOpacity: 0.2,
      maxOpacity: 1,
      frequencyHz: 1,
      waveform: 'sine',
    },
    now
  );

  const start = sampleDisplayScreenOverlay(state, now);
  const later = sampleDisplayScreenOverlay(state, now + 250);

  assert.notEqual(start.color, later.color);
  assert.ok(later.opacity > start.opacity);
});

test('clears Display overlay and drops any active modulation effect', () => {
  const cleared = createClearedDisplayScreenOverlayState();
  const sample = sampleDisplayScreenOverlay(cleared, 1000);

  assert.equal(cleared.effect, null);
  assert.deepEqual(sample, { visible: false, color: '#000000', opacity: 0 });
});
