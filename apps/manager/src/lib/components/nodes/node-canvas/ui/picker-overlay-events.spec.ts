/**
 * Purpose: Regression tests for NodePickerOverlay change propagation helpers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { updatePickerCategory, updatePickerQuery } from './picker-overlay-events.js';

test('picker search changes notify the parent controller value', () => {
  let received = '';
  const next = updatePickerQuery('screen', {
    onQueryChange: (value) => {
      received = value;
    },
  });

  assert.equal(next, 'screen');
  assert.equal(received, 'screen');
});

test('picker category changes notify the parent controller value', () => {
  let received = '';
  const next = updatePickerCategory('Display', {
    onSelectedCategoryChange: (value) => {
      received = value;
    },
  });

  assert.equal(next, 'Display');
  assert.equal(received, 'Display');
});
