/**
 * Purpose: Tests for Display text overlay state used by AI/operator text output.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createClearedDisplayTextOverlayState,
  createDisplayTextOverlayState,
} from './display-text-overlay';

test('creates visible Display text overlay state from showText payloads', () => {
  const state = createDisplayTextOverlayState({
    text: '你好，欢迎回来',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.72)',
    duration: 3000,
  });

  assert.deepEqual(state, {
    visible: true,
    text: '你好，欢迎回来',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.72)',
    duration: 3000,
  });
});

test('clears Display text overlay for empty text', () => {
  assert.deepEqual(createDisplayTextOverlayState({ text: '   ' }), createClearedDisplayTextOverlayState());
});
