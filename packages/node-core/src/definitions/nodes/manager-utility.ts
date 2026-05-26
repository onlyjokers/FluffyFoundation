/**
 * Purpose: Validation-safe definitions for Manager-local MIDI and parameter utility nodes.
 */
import type { NodeDefinition } from '../../types.js';
import { coerceBoolean } from '../utils.js';

const finiteNumber = (value: unknown, fallback = 0): number => {
  const next = typeof value === 'number' ? value : Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

type Rgb = { r: number; g: number; b: number };

const managerLocalMetadata = (description: string): NodeDefinition['metadata'] => ({
  version: '1.0.0',
  platformTargets: ['manager'],
  sideEffectClass: 'local-state',
  permissions: [],
  compatibility: [
    {
      target: 'Manager runtime',
      rule: 'This node is evaluated by the Manager browser runtime.',
      repairHint: 'Keep it in a Manager-owned graph; server snapshots only validate the schema.',
    },
  ],
  examples: [],
  risks: [],
  description,
});

const parseHexColor = (value: unknown): Rgb | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  if (full.length !== 6 || !/^[0-9a-fA-F]+$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

const toHexColor = ({ r, g, b }: Rgb): string => {
  const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
};

export function createMidiFuzzyNode(): NodeDefinition {
  return {
    type: 'midi-fuzzy',
    label: 'Fuzzy Bind',
    category: 'MIDI',
    metadata: managerLocalMetadata('Reads a normalized MIDI control value in the Manager runtime.'),
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'fuzzy' }],
    configSchema: [{ key: 'source', label: 'MIDI', type: 'midi-source', defaultValue: null }],
    process: () => ({ value: 0 }),
  };
}

export function createMidiBooleanNode(): NodeDefinition {
  return {
    type: 'midi-boolean',
    label: 'Boolean Bind',
    category: 'MIDI',
    metadata: managerLocalMetadata('Reads a MIDI control as a boolean in the Manager runtime.'),
    inputs: [
      {
        id: 'threshold',
        label: 'Threshold',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    configSchema: [
      { key: 'source', label: 'MIDI', type: 'midi-source', defaultValue: null },
      { key: 'buttonize', label: 'Buttonize', type: 'boolean', defaultValue: true },
      {
        key: 'threshold',
        label: 'Threshold',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    process: () => ({ value: false }),
  };
}

export function createMidiMapNode(): NodeDefinition {
  return {
    type: 'midi-map',
    label: 'Numeral Mapping',
    category: 'MIDI',
    metadata: managerLocalMetadata('Maps a normalized MIDI value into a numeric range.'),
    inputs: [
      { id: 'in', label: 'In', type: 'fuzzy' },
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0, step: 0.01 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 1, step: 0.01 },
      { id: 'invert', label: 'Invert', type: 'boolean' },
      { id: 'round', label: 'Round', type: 'boolean' },
      { id: 'integer', label: 'Integer', type: 'boolean' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [
      { key: 'min', label: 'Min', type: 'number', defaultValue: 0, step: 0.01 },
      { key: 'max', label: 'Max', type: 'number', defaultValue: 1, step: 0.01 },
      { key: 'invert', label: 'Invert', type: 'boolean', defaultValue: false },
      { key: 'round', label: 'Round', type: 'boolean', defaultValue: false },
      { key: 'integer', label: 'Integer', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const raw = clamp01(finiteNumber(inputs.in, 0));
      const min = finiteNumber(inputs.min, finiteNumber(config.min, 0));
      const max = finiteNumber(inputs.max, finiteNumber(config.max, 1));
      const t = coerceBoolean(inputs.invert ?? config.invert) ? 1 - raw : raw;
      const mapped = min + (max - min) * t;
      return {
        out:
          coerceBoolean(inputs.integer ?? config.integer) ||
          coerceBoolean(inputs.round ?? config.round)
            ? Math.round(mapped)
            : mapped,
      };
    },
  };
}

export function createMidiSelectMapNode(): NodeDefinition {
  return {
    type: 'midi-select-map',
    label: 'Selection Mapping',
    category: 'MIDI',
    metadata: managerLocalMetadata('Maps a normalized MIDI value into a string option.'),
    inputs: [
      { id: 'in', label: 'In', type: 'fuzzy' },
      { id: 'invert', label: 'Invert', type: 'boolean' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'string' }],
    configSchema: [{ key: 'invert', label: 'Invert', type: 'boolean', defaultValue: false }],
    process: (inputs, config) => {
      const options = Array.isArray(config.options)
        ? config.options.map(String).filter(Boolean)
        : [];
      if (options.length === 0) return { out: null };
      const raw = clamp01(finiteNumber(inputs.in, 0));
      const t = coerceBoolean(inputs.invert ?? config.invert) ? 1 - raw : raw;
      return { out: options[Math.min(options.length - 1, Math.floor(t * options.length))] ?? null };
    },
  };
}

export function createMidiColorMapNode(): NodeDefinition {
  return {
    type: 'midi-color-map',
    label: 'Color Mapping',
    category: 'MIDI',
    metadata: managerLocalMetadata('Maps a normalized MIDI value into a color gradient.'),
    inputs: [
      { id: 'in', label: 'In', type: 'fuzzy', defaultValue: 0 },
      { id: 'from', label: 'From', type: 'color' },
      { id: 'to', label: 'To', type: 'color' },
      { id: 'invert', label: 'Invert', type: 'boolean' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'color' }],
    configSchema: [
      { key: 'from', label: 'From', type: 'string', defaultValue: '#6366f1' },
      { key: 'to', label: 'To', type: 'string', defaultValue: '#ffffff' },
      { key: 'invert', label: 'Invert', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const from =
        parseHexColor(inputs.from) ?? parseHexColor(config.from) ?? parseHexColor('#6366f1');
      const to = parseHexColor(inputs.to) ?? parseHexColor(config.to) ?? parseHexColor('#ffffff');
      if (!from || !to) return { out: null };
      const raw = clamp01(finiteNumber(inputs.in, 0));
      const t = coerceBoolean(inputs.invert ?? config.invert) ? 1 - raw : raw;
      return {
        out: toHexColor({
          r: from.r + (to.r - from.r) * t,
          g: from.g + (to.g - from.g) * t,
          b: from.b + (to.b - from.b) * t,
        }),
      };
    },
  };
}
