// Purpose: Tests for VideoPlayer audio helper guards.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asPromiseLike,
  getAudioContextCtor,
  resolveToneRawContext,
  toErrorName,
  unwrapDefaultExport,
} from './video-player-audio';

describe('video-player-audio helpers', () => {
  it('resolveToneRawContext returns null for invalid module', () => {
    assert.equal(resolveToneRawContext(null), null);
    assert.equal(resolveToneRawContext({}), null);
  });

  it('resolveToneRawContext returns rawContext when present', () => {
    const ctx = {} as AudioContext;
    const mod = {
      getContext: () => ({ rawContext: ctx }),
    };
    assert.equal(resolveToneRawContext(mod), ctx);
  });

  it('getAudioContextCtor prefers AudioContext over webkitAudioContext', () => {
    class Primary {}
    class Webkit {}
    const win = {
      AudioContext: Primary,
      webkitAudioContext: Webkit,
    } as unknown as Window & {
      AudioContext: typeof AudioContext;
      webkitAudioContext: typeof AudioContext;
    };
    assert.equal(getAudioContextCtor(win), Primary);
  });

  it('asPromiseLike returns null for non-promises', () => {
    assert.equal(asPromiseLike(null), null);
    assert.equal(asPromiseLike({}), null);
  });

  it('asPromiseLike returns value when catch exists', () => {
    const value = { catch: () => undefined };
    assert.equal(asPromiseLike(value), value);
  });

  it('toErrorName returns empty string for invalid errors', () => {
    assert.equal(toErrorName(null), '');
    assert.equal(toErrorName({}), '');
  });

  it('unwrapDefaultExport returns default export when present', () => {
    const value = { default: { foo: 'bar' } };
    assert.deepEqual(unwrapDefaultExport(value), { foo: 'bar' });
  });

  it('unwrapDefaultExport falls back to value when no default', () => {
    const value = { foo: 'bar' };
    assert.deepEqual(unwrapDefaultExport(value), value);
  });
});
