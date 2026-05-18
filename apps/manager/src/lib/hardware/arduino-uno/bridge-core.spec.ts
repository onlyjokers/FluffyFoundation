/**
 * Purpose: Regression coverage for Arduino UNO bridge command planning from semantic node graph state.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import { diffArduinoUnoBridgeCommands, collectArduinoUnoPayloads } from './bridge-core';

const graph: GraphState = {
  nodes: [
    {
      id: 'pwm-1',
      type: 'plugin:arduino-uno:pwm',
      position: { x: 0, y: 0 },
      config: {},
      inputValues: { value: 0.25, pin: 6 },
      outputValues: {},
    },
    {
      id: 'digital-1',
      type: 'plugin:arduino-uno:digital',
      position: { x: 0, y: 0 },
      config: {},
      inputValues: { value: true, pin: 13 },
      outputValues: {},
    },
  ],
  connections: [],
};

test('collectArduinoUnoPayloads reads Arduino node inputs from computed values first', () => {
  const result = collectArduinoUnoPayloads({
    graph,
    getComputedInputs: (nodeId) => (nodeId === 'pwm-1' ? { value: 0.75, pin: 9 } : null),
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.payloads, [
    { action: 'pwm', nodeId: 'pwm-1', pin: 9, value: 0.75 },
    { action: 'digital', nodeId: 'digital-1', pin: 13, value: true },
  ]);
});

test('diffArduinoUnoBridgeCommands emits writes, dedupes unchanged values, and resets removed nodes', () => {
  const first = diffArduinoUnoBridgeCommands(new Map(), [
    { action: 'pwm', nodeId: 'pwm-1', pin: 6, value: 0.5 },
    { action: 'digital', nodeId: 'digital-1', pin: 13, value: true },
  ]);
  assert.deepEqual(first.commands.map((entry) => entry.command), ['PWM 6 0.500\n', 'DIGITAL 13 ON\n']);

  const unchanged = diffArduinoUnoBridgeCommands(first.nextActive, [
    { action: 'pwm', nodeId: 'pwm-1', pin: 6, value: 0.5 },
    { action: 'digital', nodeId: 'digital-1', pin: 13, value: true },
  ]);
  assert.deepEqual(unchanged.commands, []);

  const changed = diffArduinoUnoBridgeCommands(first.nextActive, [
    { action: 'pwm', nodeId: 'pwm-1', pin: 9, value: 0.25 },
  ]);
  assert.deepEqual(changed.commands.map((entry) => entry.command), [
    'PWM 6 0.000\n',
    'PWM 9 0.250\n',
    'DIGITAL 13 OFF\n',
  ]);
});

test('collectArduinoUnoPayloads reports invalid pins without throwing', () => {
  const result = collectArduinoUnoPayloads({
    graph: {
      nodes: [
        {
          id: 'pwm-bad',
          type: 'plugin:arduino-uno:pwm',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { value: 0.5, pin: 12 },
          outputValues: {},
        },
      ],
      connections: [],
    },
    getComputedInputs: () => null,
  });

  assert.deepEqual(result.payloads, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.nodeId, 'pwm-bad');
  assert.match(result.errors[0]?.message ?? '', /PWM pin/);
});
