import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARDUINO_UNO_PLUGIN_ID,
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
    'plugin:arduino-uno:pwm',
    'plugin:arduino-uno:digital',
  ]);

  const pwm = definitions[0];
  assert.equal(pwm.label, 'Uno Pwm');
  assert.deepEqual(
    pwm.inputs.map((port) => [port.id, port.type, port.min, port.max]),
    [
      ['value', 'number', 0, 1],
      ['pin', 'number', 3, 11],
    ]
  );
  assert.equal(pwm.outputs[0].type, 'number');
  assert.deepEqual(pwm.metadata.platformTargets, ['manager']);
  assert.equal(pwm.metadata.sideEffectClass, 'remote-control');
  assert.ok(pwm.metadata.permissions.includes('hardware:serial'));
  assert.ok(pwm.metadata.description.includes('Arduino UNO'));
});

test('Arduino UNO plugin manifest declares hardware serial capability', () => {
  const plugin = createArduinoUnoPlugin();
  assert.equal(plugin.manifest.id, ARDUINO_UNO_PLUGIN_ID);
  assert.ok(plugin.manifest.capabilities.includes('hardware.serial.arduino-uno'));
  assert.ok(plugin.manifest.capabilities.includes('device:arduino-uno'));
});
