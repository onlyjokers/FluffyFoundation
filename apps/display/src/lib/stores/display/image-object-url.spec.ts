/**
 * Purpose: Regression tests for display image object URL conversion helpers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('display data image conversion avoids synchronous base64 loops', () => {
  const source = readFileSync(new URL('./image-object-url.ts', import.meta.url), 'utf8');

  assert.match(source, /fetch\(trimmed\)/);
  assert.match(source, /imageObjectUrlSeq/);
  assert.match(source, /seq !== imageObjectUrlSeq/);
  assert.doesNotMatch(source, /\batob\(/);
  assert.doesNotMatch(source, /new Uint8Array/);
});
