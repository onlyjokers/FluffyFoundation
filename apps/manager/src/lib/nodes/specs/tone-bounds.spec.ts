// Purpose: verify Tone node specs expose semantic bounds used by Canvas, CLI, and AI commands.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ConfigField, NodePort } from '@shugu/node-core';

import toneDelay from './tone-delay.json';
import toneGranular from './tone-granular.json';
import tonePitch from './tone-pitch.json';
import toneResonator from './tone-resonator.json';
import toneReverb from './tone-reverb.json';

type ToneSpec = {
  type: string;
  inputs?: NodePort[];
  configSchema?: ConfigField[];
};

const specs = [
  toneDelay,
  toneGranular,
  tonePitch,
  toneResonator,
  toneReverb,
] as ToneSpec[];

const expectedBounds: Record<string, Record<string, { min?: number; max?: number }>> = {
  'tone-delay': {
    time: { min: 0.001, max: 60 },
    feedback: { min: 0, max: 0.95 },
    wet: { min: 0, max: 1 },
  },
  'tone-granular': {
    gate: { min: 0, max: 1 },
    playbackRate: { min: 0.01, max: 4 },
    detune: { min: -2400, max: 2400 },
    grainSize: { min: 0.001, max: 2 },
    overlap: { min: 0, max: 2 },
    volume: { min: 0, max: 2 },
  },
  'tone-pitch': {
    pitch: { min: -24, max: 24 },
    windowSize: { min: 0.001, max: 1 },
  },
  'tone-resonator': {
    resonance: { min: 0, max: 0.9999 },
    dampening: { min: 20, max: 20000 },
    wet: { min: 0, max: 1 },
  },
  'tone-reverb': {
    decay: { min: 0.001, max: 60 },
    wet: { min: 0, max: 1 },
  },
};

for (const spec of specs) {
  test(`${spec.type} exposes semantic bounds on number inputs and config fields`, () => {
    const expected = expectedBounds[spec.type] ?? {};
    for (const [key, bounds] of Object.entries(expected)) {
      const input = spec.inputs?.find((item) => item.id === key);
      const field = spec.configSchema?.find((item) => item.key === key);
      assert.equal(input?.min, bounds.min, `${spec.type}.${key} input min`);
      assert.equal(input?.max, bounds.max, `${spec.type}.${key} input max`);
      if (field) {
        assert.equal(field.min, bounds.min, `${spec.type}.${key} config min`);
        assert.equal(field.max, bounds.max, `${spec.type}.${key} config max`);
      }
    }
  });
}
