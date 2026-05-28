/**
 * Purpose: Regression tests for client image overlay update behavior.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('client image display replaces the image element when the resolved URL changes', () => {
  const source = readFileSync(new URL('./ImageDisplay.svelte', import.meta.url), 'utf8');

  assert.match(source, /\{#key\s+url\}/);
  assert.doesNotMatch(source, /new Image\(\)/);
  assert.doesNotMatch(source, /display:\s*none/);
});
