// Purpose: Verify client mic sensor payloads match protocol validation.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMicSensorPayload } from './audio-sensor-payload';

test('createMicSensorPayload omits bpm when analysis has not produced a finite number', () => {
  assert.deepEqual(
    createMicSensorPayload({
      rms: 0.4,
      lowEnergy: 0.1,
      highEnergy: 0.2,
      bpm: null,
    }),
    {
      volume: 0.4,
      lowEnergy: 0.1,
      highEnergy: 0.2,
    }
  );
});

test('createMicSensorPayload includes finite bpm values', () => {
  assert.deepEqual(
    createMicSensorPayload({
      rms: 0.4,
      lowEnergy: 0.1,
      highEnergy: 0.2,
      bpm: 128,
    }),
    {
      volume: 0.4,
      lowEnergy: 0.1,
      highEnergy: 0.2,
      bpm: 128,
    }
  );
});
