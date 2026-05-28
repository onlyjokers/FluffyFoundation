// Purpose: Tests for ASCII post-processing grid sizing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAsciiGridSize } from './ascii';

describe('ASCII effect grid sizing', () => {
  it('keeps cell size 100 effective instead of clamping to the old 24x18 grid', () => {
    assert.deepEqual(getAsciiGridSize(1920, 1080, 45), { cellSize: 45, cols: 42, rows: 22 });
    assert.deepEqual(getAsciiGridSize(1920, 1080, 100), { cellSize: 100, cols: 19, rows: 10 });
  });

  it('keeps a small minimum grid for very high values on small screens', () => {
    assert.deepEqual(getAsciiGridSize(320, 180, 100), { cellSize: 100, cols: 4, rows: 2 });
  });
});
