/**
 * Purpose: Regression coverage for Arduino UNO bridge command planning from semantic node graph state.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import {
  collectArduinoUnoPayloads,
  diffArduinoUnoBridgeCommands,
  resolveArduinoUnoDeviceTargets,
  collectArduinoUnoSerialRoutes,
} from './bridge-core';

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
    { target: 'arduino', action: 'pwm', nodeId: 'pwm-1', pin: 9, value: 0.75 },
    { target: 'arduino', action: 'digital', nodeId: 'digital-1', pin: 13, value: true },
  ]);
});

test('collectArduinoUnoSerialRoutes only emits commands routed through Static Serial Player to Arduino', () => {
  const result = collectArduinoUnoSerialRoutes({
    graph: {
      nodes: [
        {
          id: 'pwm-1',
          type: 'plugin:arduino-uno:pwm',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { value: 0.75, pin: 9 },
          outputValues: {},
        },
        {
          id: 'player-1',
          type: 'static-serial-player',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'arduino-1',
          type: 'arduino-object',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { index: 2, range: 1, random: false },
          outputValues: {},
        },
        {
          id: 'unrouted-digital',
          type: 'plugin:arduino-uno:digital',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { value: true, pin: 13 },
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'pwm-1',
          sourcePortId: 'cmd',
          targetNodeId: 'player-1',
          targetPortId: 'in',
        },
        {
          id: 'c2',
          sourceNodeId: 'player-1',
          sourcePortId: 'cmd',
          targetNodeId: 'arduino-1',
          targetPortId: 'in',
        },
      ],
    },
    getComputedInputs: () => null,
    arduinoIdsInOrder: () => ['uno-a', 'uno-b'],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.routes, [
    {
      arduinoId: 'uno-b',
      payload: { target: 'arduino', action: 'pwm', nodeId: 'pwm-1', pin: 9, value: 0.75 },
    },
  ]);
});

test('collectArduinoUnoSerialRoutes emits commands routed directly to Arduino object', () => {
  const result = collectArduinoUnoSerialRoutes({
    graph: {
      nodes: [
        {
          id: 'digital-1',
          type: 'plugin:arduino-uno:digital',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { value: true, pin: 8 },
          outputValues: {},
        },
        {
          id: 'arduino-1',
          type: 'arduino-object',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { index: 1, range: 1, random: false },
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'digital-1',
          sourcePortId: 'cmd',
          targetNodeId: 'arduino-1',
          targetPortId: 'in',
        },
      ],
    },
    getComputedInputs: () => null,
    arduinoIdsInOrder: () => ['uno-a'],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.routes, [
    {
      arduinoId: 'uno-a',
      payload: { target: 'arduino', action: 'digital', nodeId: 'digital-1', pin: 8, value: true },
    },
  ]);
});

test('resolveArduinoUnoDeviceTargets supports index range random and clamps to available devices', () => {
  const graph: GraphState = {
    nodes: [
      {
        id: 'arduino-1',
        type: 'arduino-object',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 99, range: 99, random: false },
        outputValues: {},
      },
      {
        id: 'arduino-2',
        type: 'arduino-object',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 2, range: 2, random: true },
        outputValues: {},
      },
    ],
    connections: [],
  };

  assert.deepEqual(
    resolveArduinoUnoDeviceTargets({
      graph,
      nodeId: 'arduino-1',
      arduinoIdsInOrder: () => ['uno-a', 'uno-b', 'uno-c'],
      getComputedInputs: () => null,
    }),
    { explicit: true, ids: ['uno-c', 'uno-a', 'uno-b'] }
  );
  assert.deepEqual(
    resolveArduinoUnoDeviceTargets({
      graph,
      nodeId: 'arduino-2',
      arduinoIdsInOrder: () => ['uno-a', 'uno-b', 'uno-c'],
      getComputedInputs: () => null,
    }),
    { explicit: true, ids: ['uno-b', 'uno-c'] }
  );
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
