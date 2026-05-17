/**
 * Purpose: Regression tests for Client-side display-compatible text controls.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get, writable } from 'svelte/store';

import { executeTextControl } from './text-control-handler';
import { createClearedClientTextOverlayState } from '../client-text-overlay';

test('executeTextControl applies showText and hideText controls to the client text overlay', () => {
  const textOverlay = writable(createClearedClientTextOverlayState());

  const handledShow = executeTextControl(
    { textOverlay },
    'showText',
    { text: '  你好  ', color: '#f8fafc', backgroundColor: '#020617', duration: 2500 }
  );

  assert.equal(handledShow, true);
  assert.deepEqual(get(textOverlay), {
    visible: true,
    text: '你好',
    color: '#f8fafc',
    backgroundColor: '#020617',
    duration: 2500,
  });

  const handledHide = executeTextControl({ textOverlay }, 'hideText', {});

  assert.equal(handledHide, true);
  assert.deepEqual(get(textOverlay), createClearedClientTextOverlayState());
});
