/**
 * Purpose: Constant/value and display nodes.
 */
import type { NodeDefinition } from '../../types.js';
import { coerceBoolean, formatAnyPreview } from '../utils.js';

export function createShowAnythingNode(): NodeDefinition {
  return {
    type: 'show-anything',
    label: 'Show Anything',
    category: 'Other',
    inputs: [{ id: 'in', label: 'In', type: 'any' }],
    outputs: [{ id: 'value', label: 'Value', type: 'string' }],
    configSchema: [],
    process: (inputs) => ({ value: formatAnyPreview(inputs.in) }),
  };
}

export function createNoteNode(): NodeDefinition {
  return {
    type: 'note',
    label: 'Note',
    category: 'Other',
    inputs: [],
    outputs: [],
    configSchema: [{ key: 'text', label: 'Text', type: 'string', defaultValue: '' }],
    process: () => ({}),
  };
}

const finiteNumber = (value: unknown, fallback = 0): number => {
  const next = typeof value === 'number' ? value : Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

// Value-box style nodes: editable constants that also pass through connected inputs.
export function createFloatNode(): NodeDefinition {
  return {
    type: 'float',
    label: 'Float',
    category: 'Values',
    inputs: [{ id: 'value', label: 'Value', type: 'number' }],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 0, step: 0.01 }],
    process: (inputs, config) => {
      const fromInput = inputs.value;
      if (typeof fromInput === 'number' && Number.isFinite(fromInput)) return { value: fromInput };
      return { value: finiteNumber(config.value, 0) };
    },
  };
}

export function createIntNode(): NodeDefinition {
  return {
    type: 'int',
    label: 'Int',
    category: 'Values',
    inputs: [{ id: 'value', label: 'Value', type: 'number' }],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 0, step: 1 }],
    process: (inputs, config) => {
      const fromInput = inputs.value;
      if (typeof fromInput === 'number' && Number.isFinite(fromInput)) {
        return { value: Math.round(fromInput) };
      }
      return { value: Math.round(finiteNumber(config.value, 0)) };
    },
  };
}

export function createStringNode(): NodeDefinition {
  return {
    type: 'string',
    label: 'String',
    category: 'Values',
    inputs: [{ id: 'value', label: 'Value', type: 'string' }],
    outputs: [{ id: 'value', label: 'Value', type: 'string' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'string', defaultValue: '' }],
    process: (inputs, config) => {
      const fromInput = inputs.value;
      if (typeof fromInput === 'string') return { value: fromInput };
      const fallback = config.value;
      return { value: typeof fallback === 'string' ? fallback : '' };
    },
  };
}

export function createBoolNode(): NodeDefinition {
  return {
    type: 'bool',
    label: 'Bool',
    category: 'Values',
    inputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'boolean', defaultValue: false }],
    process: (inputs, config) => {
      if (inputs.value !== undefined) return { value: coerceBoolean(inputs.value) };
      return { value: coerceBoolean(config.value) };
    },
  };
}
