// Purpose: Tests for visual effect guard helpers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asVisualEffect,
  getAsciiCellSize,
  getConvolutionScale,
  getEffectType,
} from './effect-guards';

describe('effect-guards', () => {
  it('getEffectType returns empty string for invalid values', () => {
    assert.equal(getEffectType(null), '');
    assert.equal(getEffectType({}), '');
  });

  it('getEffectType returns type when present', () => {
    assert.equal(getEffectType({ type: 'ascii' }), 'ascii');
    assert.equal(getEffectType({ type: 'convolution' }), 'convolution');
  });

  it('getAsciiCellSize returns null for invalid', () => {
    assert.equal(getAsciiCellSize({ type: 'ascii' }), null);
    assert.equal(getAsciiCellSize({ type: 'ascii', cellSize: 'nope' }), null);
  });

  it('getAsciiCellSize returns numeric values', () => {
    assert.equal(getAsciiCellSize({ type: 'ascii', cellSize: 12 }), 12);
    assert.equal(getAsciiCellSize({ type: 'ascii', cellSize: '13' }), 13);
  });

  it('getConvolutionScale returns null for invalid', () => {
    assert.equal(getConvolutionScale({ type: 'convolution' }), null);
    assert.equal(getConvolutionScale({ type: 'convolution', scale: 'nope' }), null);
  });

  it('getConvolutionScale returns numeric values', () => {
    assert.equal(getConvolutionScale({ type: 'convolution', scale: 0.7 }), 0.7);
    assert.equal(getConvolutionScale({ type: 'convolution', scale: '0.6' }), 0.6);
  });

  it('asVisualEffect returns null for unsupported type', () => {
    assert.equal(asVisualEffect({ type: 'other' }), null);
  });

  it('asVisualEffect returns effect for valid types', () => {
    assert.deepEqual(asVisualEffect({ type: 'ascii', cellSize: 10 }), {
      type: 'ascii',
      cellSize: 10,
    });
  });
});
