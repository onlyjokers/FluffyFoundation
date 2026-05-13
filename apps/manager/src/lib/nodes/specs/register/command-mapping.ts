/**
 * Purpose: Build command-node payloads from JSON field mapping definitions.
 */
import type { ControlPayload } from '@shugu/protocol';
import type { NodeDefinition } from '../../types';
import type { CommandFieldMapping, CommandRuntime, WhenCondition } from './types';
import { asRecord, clampNumber, isFiniteNumber } from './helpers';

function getString(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  mapping: Extract<CommandFieldMapping, { kind: 'string' }>
): string {
  const fromInput = mapping.inputKey ? inputs[mapping.inputKey] : undefined;
  if (typeof fromInput === 'string' && fromInput !== '') return fromInput;
  const fromConfig = mapping.configKey ? config[mapping.configKey] : undefined;
  if (typeof fromConfig === 'string' && fromConfig !== '') return fromConfig;
  return String(mapping.default ?? '');
}

function getNumber(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  mapping: Extract<CommandFieldMapping, { kind: 'number' }>
): number {
  const fromInput = mapping.inputKey ? inputs[mapping.inputKey] : undefined;
  if (isFiniteNumber(fromInput)) return fromInput;
  const fromConfig = mapping.configKey ? config[mapping.configKey] : undefined;
  if (isFiniteNumber(fromConfig)) return fromConfig;
  const fallback = Number(mapping.default ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function getEnumFromFuzzy(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  mapping: Extract<CommandFieldMapping, { kind: 'enumFromFuzzy' }>
): string {
  const options = Array.isArray(mapping.options) ? mapping.options : [];
  const fallback = mapping.configKey ? config[mapping.configKey] : undefined;
  const fallbackStr =
    typeof fallback === 'string' && fallback ? fallback : typeof mapping.default === 'string' ? mapping.default : '';

  const raw = inputs[mapping.inputKey];
  if (typeof raw === 'string' && raw) {
    if (options.includes(raw)) return raw;
  }
  if (!isFiniteNumber(raw) || options.length === 0) {
    if (fallbackStr && options.includes(fallbackStr)) return fallbackStr;
    return fallbackStr || options[0] || '';
  }

  const clamped = Math.max(0, Math.min(1, raw));
  const idx = Math.min(options.length - 1, Math.floor(clamped * options.length));
  return options[idx] ?? options[0] ?? fallbackStr;
}

function getEnumFromThreshold(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  mapping: Extract<CommandFieldMapping, { kind: 'enumFromThreshold' }>
): string {
  const raw = inputs[mapping.inputKey];
  if (isFiniteNumber(raw)) return raw >= Number(mapping.threshold ?? 0) ? mapping.whenTrue : mapping.whenFalse;

  const fallback = mapping.configKey ? config[mapping.configKey] : undefined;
  if (typeof fallback === 'string' && fallback) return fallback;
  if (typeof mapping.default === 'string') return mapping.default;
  return mapping.whenFalse;
}

function whenMatches(
  when: WhenCondition | undefined,
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  payload: Record<string, unknown>
): boolean {
  if (!when) return true;

  const left =
    when.source === 'input'
      ? inputs[when.key]
      : when.source === 'config'
        ? config[when.key]
        : payload[when.key];

  const right = when.value;

  const cmp = () => {
    switch (when.op) {
      case 'eq':
        return left === right;
      case 'ne':
        return left !== right;
      case 'gt':
        return Number(left) > Number(right);
      case 'gte':
        return Number(left) >= Number(right);
      case 'lt':
        return Number(left) < Number(right);
      case 'lte':
        return Number(left) <= Number(right);
    }
  };

  try {
    return Boolean(cmp());
  } catch {
    return false;
  }
}

function evalCommandMapping(
  mapping: CommandFieldMapping,
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  payload: Record<string, unknown>
): unknown {
  if (!whenMatches(mapping.when, inputs, config, payload)) return undefined;

  switch (mapping.kind) {
    case 'literal':
      return mapping.value;
    case 'string':
      return getString(inputs, config, mapping);
    case 'number': {
      const raw = getNumber(inputs, config, mapping);
      const clamped = clampNumber(raw, mapping.clamp);
      if (mapping.omitIfZero && clamped <= 0) return undefined;
      return clamped;
    }
    case 'enumFromFuzzy':
      return getEnumFromFuzzy(inputs, config, mapping);
    case 'enumFromThreshold':
      return getEnumFromThreshold(inputs, config, mapping);
  }
}

export function createCommandProcess(runtime: CommandRuntime): NodeDefinition['process'] {
  const clientInput = runtime.command.clientInput;
  const outKey = runtime.command.output ?? 'cmd';

  return (inputs, config) => {
    if (clientInput) {
      const clientRecord = asRecord(inputs[clientInput]);
      const clientId = typeof clientRecord?.clientId === 'string' ? clientRecord.clientId : '';
      if (!clientId) return { [outKey]: null };
    }

    const payload: Record<string, unknown> = {};
    const entries = Object.entries(runtime.command.payload ?? {});

    // Phase 1: conditions that do not depend on other computed payload fields.
    for (const [key, mapping] of entries) {
      const when = mapping.when;
      if (when?.source === 'payload') continue;
      const value = evalCommandMapping(mapping, inputs, config, payload);
      if (value !== undefined) payload[key] = value;
    }

    // Phase 2: payload-dependent conditions (e.g. include `frequency` only when `mode === "blink"`).
    for (const [key, mapping] of entries) {
      const when = mapping.when;
      if (when?.source !== 'payload') continue;
      const value = evalCommandMapping(mapping, inputs, config, payload);
      if (value !== undefined) payload[key] = value;
    }

    return {
      [outKey]: {
        action: runtime.command.action,
        payload: payload as ControlPayload,
      },
    };
  };
}
