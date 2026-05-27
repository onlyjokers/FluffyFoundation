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

const namedBooleanVariableState = new Map<string, boolean>();
const legacyBooleanVariableState = new Map<string, boolean>();
const booleanVariableOwners = new Map<string, Set<string>>();
const booleanVariableOwnerNameByNode = new Map<string, string>();
const numberVariableState = new Map<string, number>();
const stringVariableState = new Map<string, string>();

type BooleanVariableContext = {
  variableStore?: {
    boolean?: {
      get?: (name: string) => boolean | undefined;
      set?: (name: string, value: boolean) => void;
      delete?: (name: string) => void;
    };
  };
};

const normalizeVariableName = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
};

const getBooleanDefault = (
  config: Record<string, unknown>,
  inputs?: Record<string, unknown>
): boolean => coerceBoolean(inputs?.defaultValue ?? config.defaultValue);

const getBooleanVariableName = (
  inputs: Record<string, unknown>,
  config: Record<string, unknown>
): string => normalizeVariableName(inputs.name ?? config.name, 'variable');

const getBooleanVariableMode = (
  inputs: Record<string, unknown>,
  config: Record<string, unknown>
): 'latchTrue' | 'followInput' => {
  const raw = inputs.mode ?? config.mode;
  return raw === 'followInput' ? 'followInput' : 'latchTrue';
};

const ensureNamedBooleanVariable = (name: string, defaultValue: boolean): void => {
  if (!namedBooleanVariableState.has(name)) {
    namedBooleanVariableState.set(name, defaultValue);
  }
};

const getBooleanVariableStore = (context: BooleanVariableContext | undefined) =>
  context?.variableStore?.boolean;

const ensureBooleanVariable = (
  context: BooleanVariableContext | undefined,
  name: string,
  defaultValue: boolean
): void => {
  const store = getBooleanVariableStore(context);
  if (store?.get && store.set) {
    const existing = store.get(name);
    if (existing === undefined) {
      store.set(name, defaultValue);
    }
    return;
  }
  ensureNamedBooleanVariable(name, defaultValue);
};

const readBooleanVariable = (
  context: BooleanVariableContext | undefined,
  name: string
): boolean | undefined => {
  const store = context?.variableStore?.boolean;
  return store?.get ? store.get(name) : namedBooleanVariableState.get(name);
};

const writeBooleanVariable = (
  context: BooleanVariableContext | undefined,
  name: string,
  value: boolean
): void => {
  const store = context?.variableStore?.boolean;
  if (store?.set) store.set(name, value);
  else namedBooleanVariableState.set(name, value);
};

const getNumberDefault = (config: Record<string, unknown>): number =>
  finiteNumber(config.defaultValue, 0);

const getStringDefault = (config: Record<string, unknown>): string =>
  typeof config.defaultValue === 'string' ? config.defaultValue : '';

const registerBooleanVariableOwner = (name: string, nodeId: string): void => {
  const previousName = booleanVariableOwnerNameByNode.get(nodeId);
  if (previousName && previousName !== name) {
    unregisterBooleanVariableOwner(previousName, nodeId);
  }
  const owners = booleanVariableOwners.get(name) ?? new Set<string>();
  owners.add(nodeId);
  booleanVariableOwners.set(name, owners);
  booleanVariableOwnerNameByNode.set(nodeId, name);
};

const unregisterBooleanVariableOwner = (name: string, nodeId: string): void => {
  const owners = booleanVariableOwners.get(name);
  if (!owners) return;
  owners.delete(nodeId);
  if (booleanVariableOwnerNameByNode.get(nodeId) === name) {
    booleanVariableOwnerNameByNode.delete(nodeId);
  }
  if (owners.size > 0) return;
  booleanVariableOwners.delete(name);
  namedBooleanVariableState.delete(name);
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

export function createIndependentVariableNameNode(): NodeDefinition {
  return {
    type: 'independent-variable-name',
    label: 'Independent Variable Name',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'value', label: 'Name', type: 'string' }],
    configSchema: [],
    process: (_inputs, config) => ({
      value: typeof config.name === 'string' ? config.name : '',
    }),
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

export function createBooleanVariableNode(): NodeDefinition {
  return {
    type: 'boolean-variable',
    label: 'Boolean Variable (Legacy)',
    category: 'Internal',
    inputs: [
      { id: 'set', label: 'Set', type: 'boolean', kind: 'sink' },
      { id: 'reset', label: 'Reset', type: 'pulse', kind: 'sink' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [{ key: 'defaultValue', label: 'Default', type: 'boolean', defaultValue: false }],
    process: (_inputs, config, context) => {
      if (!legacyBooleanVariableState.has(context.nodeId)) {
        legacyBooleanVariableState.set(context.nodeId, getBooleanDefault(config));
      }
      return {
        value: legacyBooleanVariableState.get(context.nodeId) ?? getBooleanDefault(config),
      };
    },
    onSink: (inputs, config, context) => {
      if (coerceBoolean(inputs.reset)) {
        legacyBooleanVariableState.set(context.nodeId, getBooleanDefault(config));
        return;
      }
      if (coerceBoolean(inputs.set)) {
        legacyBooleanVariableState.set(context.nodeId, true);
      }
    },
    onDisable: (_inputs, _config, context) => {
      legacyBooleanVariableState.delete(context.nodeId);
    },
  };
}

export function createSetBooleanVariableNode(): NodeDefinition {
  return {
    type: 'set-boolean-variable',
    label: 'Set Boolean Variable',
    category: 'Values',
    inputs: [
      { id: 'name', label: 'Name', type: 'string' },
      { id: 'defaultValue', label: 'Default', type: 'boolean' },
      {
        id: 'mode',
        label: 'Mode',
        type: 'string',
        options: [
          { value: 'latchTrue', label: 'Pulse Latch' },
          { value: 'followInput', label: 'Boolean' },
        ],
      },
      { id: 'set', label: 'Set', type: 'boolean', kind: 'sink' },
      { id: 'reset', label: 'Reset', type: 'pulse', kind: 'sink' },
    ],
    outputs: [],
    configSchema: [
      { key: 'name', label: 'Name', type: 'string', defaultValue: 'variable', connectable: true },
      {
        key: 'defaultValue',
        label: 'Default',
        type: 'boolean',
        defaultValue: false,
        connectable: true,
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'latchTrue',
        connectable: true,
        options: [
          { value: 'latchTrue', label: 'Pulse Latch' },
          { value: 'followInput', label: 'Boolean' },
        ],
      },
    ],
    process: (inputs, config, context) => {
      const name = getBooleanVariableName(inputs, config);
      registerBooleanVariableOwner(name, context.nodeId);
      ensureBooleanVariable(context, name, getBooleanDefault(config, inputs));
      return {};
    },
    onSink: (inputs, config, context) => {
      const name = getBooleanVariableName(inputs, config);
      const defaultValue = getBooleanDefault(config, inputs);
      registerBooleanVariableOwner(name, context.nodeId);
      ensureBooleanVariable(context, name, defaultValue);

      if (coerceBoolean(inputs.reset)) {
        writeBooleanVariable(context, name, defaultValue);
        return;
      }

      const next = coerceBoolean(inputs.set);
      if (getBooleanVariableMode(inputs, config) === 'followInput') {
        writeBooleanVariable(context, name, next);
        return;
      }
      if (next) writeBooleanVariable(context, name, true);
    },
    onDisable: (inputs, config, context) => {
      if (!getBooleanVariableStore(context)) {
        unregisterBooleanVariableOwner(getBooleanVariableName(inputs, config), context.nodeId);
      }
    },
  };
}

export function createGetBooleanVariableNode(): NodeDefinition {
  return {
    type: 'get-boolean-variable',
    label: 'Get Boolean Variable',
    category: 'Values',
    inputs: [{ id: 'name', label: 'Name', type: 'string' }],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [
      { key: 'name', label: 'Name', type: 'string', defaultValue: 'variable', connectable: true },
    ],
    process: (inputs, config, context) => {
      const name = getBooleanVariableName(inputs, config);
      return { value: readBooleanVariable(context, name) ?? false };
    },
  };
}

export function createNumberVariableNode(): NodeDefinition {
  return {
    type: 'number-variable',
    label: 'Number Variable',
    category: 'Values',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', kind: 'sink' },
      { id: 'write', label: 'Write', type: 'boolean', kind: 'sink' },
      { id: 'reset', label: 'Reset', type: 'boolean', kind: 'sink' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [
      { key: 'defaultValue', label: 'Default', type: 'number', defaultValue: 0, step: 0.01 },
    ],
    process: (_inputs, config, context) => {
      if (!numberVariableState.has(context.nodeId)) {
        numberVariableState.set(context.nodeId, getNumberDefault(config));
      }
      return { value: numberVariableState.get(context.nodeId) ?? getNumberDefault(config) };
    },
    onSink: (inputs, config, context) => {
      if (coerceBoolean(inputs.reset)) {
        numberVariableState.set(context.nodeId, getNumberDefault(config));
        return;
      }
      if (!coerceBoolean(inputs.write)) return;
      const current = numberVariableState.get(context.nodeId) ?? getNumberDefault(config);
      numberVariableState.set(context.nodeId, finiteNumber(inputs.value, current));
    },
    onDisable: (_inputs, _config, context) => {
      numberVariableState.delete(context.nodeId);
    },
  };
}

export function createStringVariableNode(): NodeDefinition {
  return {
    type: 'string-variable',
    label: 'String Variable',
    category: 'Values',
    inputs: [
      { id: 'value', label: 'Value', type: 'string', kind: 'sink' },
      { id: 'write', label: 'Write', type: 'boolean', kind: 'sink' },
      { id: 'reset', label: 'Reset', type: 'boolean', kind: 'sink' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'string' }],
    configSchema: [{ key: 'defaultValue', label: 'Default', type: 'string', defaultValue: '' }],
    process: (_inputs, config, context) => {
      if (!stringVariableState.has(context.nodeId)) {
        stringVariableState.set(context.nodeId, getStringDefault(config));
      }
      return { value: stringVariableState.get(context.nodeId) ?? getStringDefault(config) };
    },
    onSink: (inputs, config, context) => {
      if (coerceBoolean(inputs.reset)) {
        stringVariableState.set(context.nodeId, getStringDefault(config));
        return;
      }
      if (!coerceBoolean(inputs.write)) return;
      stringVariableState.set(context.nodeId, String(inputs.value ?? ''));
    },
    onDisable: (_inputs, _config, context) => {
      stringVariableState.delete(context.nodeId);
    },
  };
}
