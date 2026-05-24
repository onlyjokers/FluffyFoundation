import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARDUINO_UNO_PLUGIN_ID,
  ARDUINO_UNO_OBJECT_NODE_TYPE,
  buildArduinoUnoDigitalPayload,
  buildArduinoUnoPwmPayload,
  createArduinoUnoNodeDefinitions,
  createArduinoUnoPlugin,
  digitalCommand,
  pwmCommand,
  resetCommandForPreviousPin,
} from '../dist-arduino-uno-plugin-out/index.js';

test('PWM payload clamps value and only allows Arduino UNO PWM pins', () => {
  assert.deepEqual(buildArduinoUnoPwmPayload({ nodeId: 'pwm-1', pin: 6, value: 1.2 }), {
    target: 'arduino',
    action: 'pwm',
    nodeId: 'pwm-1',
    pin: 6,
    value: 1,
  });

  assert.equal(pwmCommand({ pin: 6, value: 0.5 }), 'PWM 6 0.500\n');
  assert.throws(() => buildArduinoUnoPwmPayload({ nodeId: 'bad', pin: 4, value: 0.5 }), /PWM pin/);
});

test('Digital payload coerces boolean state and rejects serial pins', () => {
  assert.deepEqual(buildArduinoUnoDigitalPayload({ nodeId: 'digital-1', pin: 13, value: 1 }), {
    target: 'arduino',
    action: 'digital',
    nodeId: 'digital-1',
    pin: 13,
    value: true,
  });

  assert.equal(digitalCommand({ pin: 13, value: false }), 'DIGITAL 13 OFF\n');
  assert.throws(() => buildArduinoUnoDigitalPayload({ nodeId: 'bad', pin: 1, value: true }), /digital pin/);
});

test('reset command clears the prior pin according to node mode', () => {
  assert.equal(resetCommandForPreviousPin({ mode: 'pwm', pin: 9 }), 'PWM 9 0.000\n');
  assert.equal(resetCommandForPreviousPin({ mode: 'digital', pin: 8 }), 'DIGITAL 8 OFF\n');
});

test('Arduino UNO node definitions expose plugin metadata for AI and semantic snapshots', () => {
  const definitions = createArduinoUnoNodeDefinitions();
  assert.deepEqual(definitions.map((definition) => definition.type), [
    'arduino-object',
    'static-serial-player',
    'plugin:arduino-uno:pwm',
    'plugin:arduino-uno:digital',
  ]);

  const object = definitions.find((definition) => definition.type === ARDUINO_UNO_OBJECT_NODE_TYPE);
  assert.equal(object?.label, 'Arduino');
  assert.equal(object?.category, 'Objects');
  assert.deepEqual(
    object?.inputs.map((port) => [port.id, port.type, port.kind ?? 'data']),
    [
      ['index', 'number', 'data'],
      ['range', 'number', 'data'],
      ['random', 'boolean', 'data'],
      ['in', 'command', 'sink'],
    ]
  );
  assert.deepEqual(object?.configSchema, []);

  const serialPlayer = definitions.find((definition) => definition.type === 'static-serial-player');
  assert.equal(serialPlayer?.label, 'Static Serial Player');
  assert.equal(serialPlayer?.category, 'Player');
  assert.deepEqual(serialPlayer?.inputs.map((port) => [port.id, port.type, port.kind ?? 'data']), [
    ['in', 'command', 'sink'],
  ]);
  assert.deepEqual(serialPlayer?.outputs.map((port) => [port.id, port.type]), [['cmd', 'command']]);

  const pwm = definitions.find((definition) => definition.type === 'plugin:arduino-uno:pwm');
  assert.equal(pwm.label, 'Uno Pwm');
  assert.deepEqual(
    pwm.inputs.map((port) => [port.id, port.type, port.min, port.max]),
    [
      ['value', 'number', 0, 1],
      ['pin', 'number', 3, 11],
    ]
  );
  assert.equal(pwm.outputs[0].id, 'cmd');
  assert.equal(pwm.outputs[0].type, 'command');
  assert.deepEqual(pwm.metadata.platformTargets, ['manager']);
  assert.equal(pwm.metadata.sideEffectClass, 'remote-control');
  assert.ok(pwm.metadata.permissions.includes('hardware:serial'));
  assert.ok(pwm.metadata.description.includes('Arduino UNO'));
});

test('Arduino UNO PWM and Digital nodes emit serial command payloads', () => {
  const definitions = createArduinoUnoNodeDefinitions();
  const pwm = definitions.find((definition) => definition.type === 'plugin:arduino-uno:pwm');
  const digital = definitions.find((definition) => definition.type === 'plugin:arduino-uno:digital');

  assert.deepEqual(pwm?.process({ value: 0.25, pin: 6 }, {}, { nodeId: 'pwm-1', time: 0, deltaTime: 0 }), {
    cmd: {
      target: 'arduino',
      action: 'pwm',
      nodeId: 'pwm-1',
      pin: 6,
      value: 0.25,
    },
  });
  assert.deepEqual(digital?.process({ value: true, pin: 13 }, {}, { nodeId: 'digital-1', time: 0, deltaTime: 0 }), {
    cmd: {
      target: 'arduino',
      action: 'digital',
      nodeId: 'digital-1',
      pin: 13,
      value: true,
    },
  });
});

test('Arduino UNO plugin manifest declares hardware serial capability', () => {
  const plugin = createArduinoUnoPlugin();
  assert.equal(plugin.manifest.id, ARDUINO_UNO_PLUGIN_ID);
  assert.ok(plugin.manifest.capabilities.includes('hardware.serial.arduino-uno'));
  assert.ok(plugin.manifest.capabilities.includes('device:arduino-uno'));
});
