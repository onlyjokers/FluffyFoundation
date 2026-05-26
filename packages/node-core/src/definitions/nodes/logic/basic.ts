/**
 * Purpose: Basic array, math, and numeric logic node definitions.
 */
import type { NodeDefinition } from '../../../types.js';
import { coerceBoolean } from '../../utils.js';

function finiteNumber(value: unknown, fallback = 0): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? fallback);
  return Number.isFinite(raw) ? raw : fallback;
}

type PulseToBooleanState = {
  value: boolean;
  lastPulse: boolean;
};

const pulseToBooleanState = new Map<string, PulseToBooleanState>();

function pulseToBooleanMode(value: unknown): 'toggle' | 'latchTrue' | 'latchFalse' | 'momentary' {
  if (value === 'latchTrue' || value === 'latchFalse' || value === 'momentary') return value;
  return 'toggle';
}

function createUnaryNumberNode(opts: {
  type: string;
  label: string;
  transform: (value: number) => number;
}): NodeDefinition {
  return {
    type: opts.type,
    label: opts.label,
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    outputs: [
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    configSchema: [],
    process: (inputs) => ({
      number: opts.transform(finiteNumber(inputs.number)),
      any: inputs.any,
    }),
  };
}

export function createArrayFilterNode(): NodeDefinition {
  return {
    type: 'array-filter',
    label: 'Array Filter',
    category: 'Logic',
    inputs: [
      { id: 'a', label: 'A', type: 'array' },
      { id: 'b', label: 'B', type: 'array' },
    ],
    outputs: [{ id: 'difference', label: 'Difference', type: 'array' }],
    configSchema: [],
    process: (inputs) => {
      const a = Array.isArray(inputs.a) ? inputs.a : [];
      const b = Array.isArray(inputs.b) ? inputs.b : [];
      const bSet = new Set(b.map(String));
      const difference = a.filter((item) => !bSet.has(String(item)));
      return { difference };
    },
  };
}

export function createMathNode(): NodeDefinition {
  return {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [
      { id: 'a', label: 'A', type: 'number', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', defaultValue: 0 },
      { id: 'operation', label: 'Operation', type: 'string' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    configSchema: [
      {
        key: 'operation',
        label: 'Operation',
        type: 'select',
        defaultValue: '+',
        options: [
          { value: '+', label: 'Add (+)' },
          { value: '-', label: 'Subtract (-)' },
          { value: '*', label: 'Multiply (×)' },
          { value: '/', label: 'Divide (÷)' },
          { value: 'min', label: 'Min' },
          { value: 'max', label: 'Max' },
          { value: 'mod', label: 'Modulo (%)' },
          { value: 'pow', label: 'Power (^)' },
        ],
        connectable: true,
      },
    ],
    process: (inputs, config) => {
      const a = (inputs.a as number) ?? 0;
      const b = (inputs.b as number) ?? 0;
      const op = (() => {
        const fromInput = inputs.operation;
        if (typeof fromInput === 'string' && fromInput.trim()) return fromInput.trim();
        return String(config.operation ?? '+');
      })();

      let result: number;
      switch (op) {
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        case '*':
          result = a * b;
          break;
        case '/':
          result = b !== 0 ? a / b : 0;
          break;
        case 'min':
          result = Math.min(a, b);
          break;
        case 'max':
          result = Math.max(a, b);
          break;
        case 'mod':
          result = b !== 0 ? a % b : 0;
          break;
        case 'pow':
          result = Math.pow(a, b);
          break;
        default:
          result = a + b;
      }

      return { result };
    },
  };
}

export function createLogicAddNode(): NodeDefinition {
  return createUnaryNumberNode({
    type: 'logic-add',
    label: 'Add',
    transform: (value) => value + 1,
  });
}

export function createLogicMultipleNode(): NodeDefinition {
  return createUnaryNumberNode({
    type: 'logic-multiple',
    label: 'Multiple',
    transform: (value) => value * 1,
  });
}

export function createLogicSubtractNode(): NodeDefinition {
  return createUnaryNumberNode({
    type: 'logic-subtract',
    label: 'Subtract',
    transform: (value) => value - 1,
  });
}

export function createLogicDivideNode(): NodeDefinition {
  return createUnaryNumberNode({
    type: 'logic-divide',
    label: 'Divide',
    transform: (value) => value / 1,
  });
}

export function createLogicNumberToBooleanNode(): NodeDefinition {
  return {
    type: 'logic-number-to-boolean',
    label: 'Number to Boolean',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'trigger', label: 'Trigger', type: 'number', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => {
      const numberValue = finiteNumber(inputs.number, 0);
      const threshold = finiteNumber(inputs.trigger, 0.5);
      return { out: numberValue >= threshold };
    },
  };
}

export function createPulseToBooleanNode(): NodeDefinition {
  return {
    type: 'pulse-to-boolean',
    label: 'Pulse to Boolean',
    category: 'Logic',
    inputs: [{ id: 'pulse', label: 'Pulse', type: 'pulse', defaultValue: false }],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'toggle',
        options: [
          { value: 'toggle', label: 'Toggle' },
          { value: 'latchTrue', label: 'Latch True' },
          { value: 'latchFalse', label: 'Latch False' },
          { value: 'momentary', label: 'Momentary' },
        ],
      },
      { key: 'defaultValue', label: 'Default', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config, context) => {
      const mode = pulseToBooleanMode(config.mode);
      const defaultValue = coerceBoolean(config.defaultValue);
      const pulsed = coerceBoolean(inputs.pulse);
      if (mode === 'momentary') return { value: pulsed };

      const state = pulseToBooleanState.get(context.nodeId) ?? {
        value: defaultValue,
        lastPulse: false,
      };
      if (pulsed && !state.lastPulse) {
        if (mode === 'toggle') state.value = !state.value;
        if (mode === 'latchTrue') state.value = true;
        if (mode === 'latchFalse') state.value = false;
      }
      state.lastPulse = pulsed;
      pulseToBooleanState.set(context.nodeId, state);
      return { value: state.value };
    },
    onDisable: (_inputs, _config, context) => {
      pulseToBooleanState.delete(context.nodeId);
    },
  };
}
