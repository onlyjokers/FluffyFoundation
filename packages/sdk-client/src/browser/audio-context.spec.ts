// Purpose: Tests for browser audio context helpers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBrowserAudioContextCtor } from './audio-context';

describe('getBrowserAudioContextCtor', () => {
  it('returns null when no constructors exist', () => {
    const win = {} as Window;
    assert.equal(getBrowserAudioContextCtor(win), null);
  });

  it('prefers AudioContext over webkitAudioContext', () => {
    class Primary {}
    class Webkit {}
    const win = {
      AudioContext: Primary,
      webkitAudioContext: Webkit,
    } as unknown as Window & {
      AudioContext: typeof AudioContext;
      webkitAudioContext: typeof AudioContext;
    };
    assert.equal(getBrowserAudioContextCtor(win), Primary);
  });
});
