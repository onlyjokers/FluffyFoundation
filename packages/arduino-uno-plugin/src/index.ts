/**
 * Purpose: Arduino UNO serial hardware plugin, command helpers, and node definitions.
 */
import { definePlugin, type DefinedPlugin } from '@shugu/plugin-core';
import type { NodeDefinition } from '@shugu/node-core';

export const ARDUINO_UNO_PLUGIN_ID = 'arduino-uno';
export const ARDUINO_UNO_PWM_NODE_TYPE = 'plugin:arduino-uno:pwm';
export const ARDUINO_UNO_DIGITAL_NODE_TYPE = 'plugin:arduino-uno:digital';

const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
const DIGITAL_PINS = new Set(Array.from({ length: 12 }, (_, idx) => idx + 2));

export type ArduinoUnoAction = 'pwm' | 'digital';

export type ArduinoUnoPwmPayload = {
  action: 'pwm';
  nodeId: string;
  pin: number;
  value: number;
};

export type ArduinoUnoDigitalPayload = {
  action: 'digital';
  nodeId: string;
  pin: number;
  value: boolean;
};

export type ArduinoUnoPayload = ArduinoUnoPwmPayload | ArduinoUnoDigitalPayload;

export type ArduinoUnoResetInput = {
  mode: ArduinoUnoAction;
  pin: number;
};

export type ArduinoUnoPwmInput = {
  nodeId: string;
  pin: unknown;
  value: unknown;
};

export type ArduinoUnoDigitalInput = {
  nodeId: string;
  pin: unknown;
  value: unknown;
};

function finiteNumber(value: unknown, fallback: number): number {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function integerPin(value: unknown): number {
  const pin = Math.trunc(finiteNumber(value, Number.NaN));
  if (!Number.isFinite(pin)) throw new Error('Arduino UNO pin must be a finite number.');
  return pin;
}

function clamp01(value: unknown): number {
  const next = finiteNumber(value, 0);
  return Math.max(0, Math.min(1, next));
}

export function assertArduinoUnoPwmPin(value: unknown): number {
  const pin = integerPin(value);
  if (!PWM_PINS.has(pin)) {
    throw new Error('Arduino UNO PWM pin must be one of 3, 5, 6, 9, 10, or 11.');
  }
  return pin;
}

export function assertArduinoUnoDigitalPin(value: unknown): number {
  const pin = integerPin(value);
  if (!DIGITAL_PINS.has(pin)) {
    throw new Error('Arduino UNO digital pin must be from 2 to 13.');
  }
  return pin;
}

export function buildArduinoUnoPwmPayload(input: ArduinoUnoPwmInput): ArduinoUnoPwmPayload {
  return {
    action: 'pwm',
    nodeId: String(input.nodeId),
    pin: assertArduinoUnoPwmPin(input.pin),
    value: clamp01(input.value),
  };
}

export function buildArduinoUnoDigitalPayload(input: ArduinoUnoDigitalInput): ArduinoUnoDigitalPayload {
  return {
    action: 'digital',
    nodeId: String(input.nodeId),
    pin: assertArduinoUnoDigitalPin(input.pin),
    value: Boolean(input.value),
  };
}

export function pwmCommand(input: Pick<ArduinoUnoPwmPayload, 'pin' | 'value'>): string {
  const pin = assertArduinoUnoPwmPin(input.pin);
  const value = clamp01(input.value);
  return `PWM ${pin} ${value.toFixed(3)}\n`;
}

export function digitalCommand(input: Pick<ArduinoUnoDigitalPayload, 'pin' | 'value'>): string {
  const pin = assertArduinoUnoDigitalPin(input.pin);
  return `DIGITAL ${pin} ${input.value ? 'ON' : 'OFF'}\n`;
}

export function commandForPayload(payload: ArduinoUnoPayload): string {
  return payload.action === 'pwm' ? pwmCommand(payload) : digitalCommand(payload);
}

export function resetCommandForPreviousPin(input: ArduinoUnoResetInput): string {
  return input.mode === 'pwm'
    ? pwmCommand({ pin: input.pin, value: 0 })
    : digitalCommand({ pin: input.pin, value: false });
}

export function createArduinoUnoPlugin(): DefinedPlugin {
  return definePlugin(
    {
      id: ARDUINO_UNO_PLUGIN_ID,
      version: '1.0.0',
      apiVersion: 1,
      capabilities: ['hardware.serial.arduino-uno', 'device:arduino-uno'],
      supportedProtocolVersions: [1],
      sideEffects: ['state'],
      description: 'Controls an Arduino UNO attached to the Manager computer over serial.',
    },
    () => ({})
  );
}

const arduinoPermissions = ['hardware:serial', 'device:arduino-uno', 'control:send'];

export function createArduinoUnoPwmNodeDefinition(): NodeDefinition {
  return {
    type: ARDUINO_UNO_PWM_NODE_TYPE,
    label: 'Uno Pwm',
    category: 'Plugin',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager'],
      sideEffectClass: 'remote-control',
      permissions: arduinoPermissions,
      compatibility: [
        {
          target: 'Arduino UNO',
          rule: 'Requires firmware that accepts PWM <pin> <0..1> commands at 9600 baud.',
          repairHint: 'Upload the Arduino UNO serial firmware and connect it from Manager.',
        },
      ],
      examples: [
        {
          title: 'Drive a dimmable output',
          summary: 'Connect a 0..1 number to value and set pin to a PWM-capable UNO pin.',
          inputs: { value: 0.5, pin: 6 },
        },
      ],
      risks: [
        'Writes to real Arduino UNO PWM hardware.',
        'Changing pin while running resets the previous pin to 0.',
      ],
      description: 'Controls an Arduino UNO PWM output from 0 to 1 through the Manager-local serial bridge.',
      repairHints: [
        'Use UNO PWM pins 3, 5, 6, 9, 10, or 11.',
        'Connect the Arduino UNO from Manager before running the graph.',
      ],
    },
    inputs: [
      { id: 'value', label: 'Value', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
      { id: 'pin', label: 'Pin', type: 'number', defaultValue: 6, min: 3, max: 11, step: 1 },
    ],
    outputs: [{ id: 'state', label: 'State', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const payload = buildArduinoUnoPwmPayload({
        nodeId: context.nodeId,
        value: inputs.value,
        pin: inputs.pin,
      });
      return { state: payload.value };
    },
  };
}

export function createArduinoUnoDigitalNodeDefinition(): NodeDefinition {
  return {
    type: ARDUINO_UNO_DIGITAL_NODE_TYPE,
    label: 'Uno Number',
    category: 'Plugin',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager'],
      sideEffectClass: 'remote-control',
      permissions: arduinoPermissions,
      compatibility: [
        {
          target: 'Arduino UNO',
          rule: 'Requires firmware that accepts DIGITAL <pin> ON|OFF commands at 9600 baud.',
          repairHint: 'Upload the Arduino UNO serial firmware and connect it from Manager.',
        },
      ],
      examples: [
        {
          title: 'Drive a digital output',
          summary: 'Connect a boolean to value and set pin to a digital UNO pin.',
          inputs: { value: true, pin: 13 },
        },
      ],
      risks: [
        'Writes to real Arduino UNO digital hardware.',
        'Changing pin while running resets the previous pin to LOW.',
      ],
      description: 'Controls an Arduino UNO digital output through the Manager-local serial bridge.',
      repairHints: [
        'Use UNO digital pins 2 through 13.',
        'Pins 0 and 1 are reserved for serial communication and are rejected.',
      ],
    },
    inputs: [
      { id: 'value', label: 'Value', type: 'boolean', defaultValue: false },
      { id: 'pin', label: 'Pin', type: 'number', defaultValue: 13, min: 2, max: 13, step: 1 },
    ],
    outputs: [{ id: 'state', label: 'State', type: 'boolean', defaultValue: false }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const payload = buildArduinoUnoDigitalPayload({
        nodeId: context.nodeId,
        value: inputs.value,
        pin: inputs.pin,
      });
      return { state: payload.value };
    },
  };
}

export function createArduinoUnoNodeDefinitions(): NodeDefinition[] {
  return [createArduinoUnoPwmNodeDefinition(), createArduinoUnoDigitalNodeDefinition()];
}
