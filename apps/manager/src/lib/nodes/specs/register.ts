/**
 * JSON Node Specs / UI Overlays (Manager)
 *
 * Node runtime behavior and the authoritative port/config schema live in `@shugu/node-core`.
 * JSON files under this folder act as a *UI overlay* layer (label/category/constraints/etc).
 *
 * Back-compat:
 * - JSON files may still include `runtime.kind`. This is only used to define manager-only nodes
 *   (e.g. MIDI helpers) that do not exist in node-core yet.
 * - For node-core node types, `runtime` is ignored and only overlay fields are applied.
 */
import { get } from 'svelte/store';
import {
  targetClients,
  type ControlAction,
  type ControlPayload,
} from '@shugu/protocol';
import {
  NodeRegistry as CoreNodeRegistry,
  registerDefaultNodeDefinitions,
  type NodeCommand,
} from '@shugu/node-core';

import { nodeRegistry } from '../registry';
import type { ConfigField, NodeDefinition, NodePort, ProcessContext } from '../types';
import { parameterRegistry } from '$lib/parameters/registry';
import { clientScreenshotUploads, displayTransport, getSDK, sensorData, state, selectClients } from '$lib/stores/manager';
import { midiNodeBridge, type MidiSource } from '$lib/features/midi/midi-node-bridge';
import { mapRangeWithOptions } from '$lib/features/midi/midi-math';

type WhenOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
type WhenSource = 'input' | 'config' | 'payload';
type WhenCondition = { source: WhenSource; key: string; op: WhenOp; value: string | number | boolean };

type ClampSpec = { min?: number; max?: number };

type MidiBooleanState = {
  value: boolean;
  lastPressed: boolean;
  sourceKey: string | null;
};

type ClientSelectionState = {
  index: number;
  range: number;
  random: boolean;
  baseRandomIds: string[];
  selectedIds: string[];
  clientsKey: string;
};

type CommandFieldMapping =
  | { kind: 'literal'; value: unknown; when?: WhenCondition }
  | {
      kind: 'number';
      inputKey?: string;
      configKey?: string;
      default?: number;
      clamp?: ClampSpec;
      omitIfZero?: boolean;
      when?: WhenCondition;
    }
  | {
      kind: 'string';
      inputKey?: string;
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    }
  | {
      kind: 'enumFromFuzzy';
      inputKey: string;
      options: string[];
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    }
  | {
      kind: 'enumFromThreshold';
      inputKey: string;
      threshold: number;
      whenTrue: string;
      whenFalse: string;
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    };

type CommandRuntime = {
  kind: 'command';
  command: {
    action: ControlAction;
    /** Optional gating: when set, requires `inputs[clientInput].clientId` to be present. */
    clientInput?: string;
    output?: string; // default: 'cmd'
    payload: Record<string, CommandFieldMapping>;
  };
};

type NodeRuntime =
  | { kind: 'client-object' }
  | { kind: 'display-object' }
  | { kind: 'proc-client-sensors' }
  | { kind: 'param-get' }
  | { kind: 'param-set' }
  | { kind: 'number' }
  | { kind: 'number-stabilizer' }
  | { kind: 'math' }
  | { kind: 'logic-add' }
  | { kind: 'logic-multiple' }
  | { kind: 'logic-subtract' }
  | { kind: 'logic-divide' }
  | { kind: 'logic-if' }
  | { kind: 'logic-for' }
  | { kind: 'logic-sleep' }
  | { kind: 'logic-number-to-boolean' }
  | { kind: 'number-script' }
  | { kind: 'client-count' }
  | { kind: 'array-filter' }
  | { kind: 'group-frame' }
  | { kind: 'group-activate' }
  | { kind: 'tone-osc' }
  | { kind: 'tone-delay' }
  | { kind: 'tone-resonator' }
  | { kind: 'tone-pitch' }
  | { kind: 'tone-reverb' }
  | { kind: 'tone-granular' }
  | { kind: 'play-media' }
  | { kind: 'midi-fuzzy' }
  | { kind: 'midi-boolean' }
  | { kind: 'midi-map' }
  | { kind: 'midi-select-map' }
  | { kind: 'midi-color-map' }
  | CommandRuntime;

export type NodeSpec = {
  type: string;
  label?: string;
  category?: string;
  inputs?: NodePort[];
  outputs?: NodePort[];
  configSchema?: ConfigField[];
  runtime?: NodeRuntime;
};

type CoreRuntimeImpl = Pick<NodeDefinition, 'process' | 'onSink'>;

const coreRuntimeImplByKind: Map<string, CoreRuntimeImpl> = (() => {
  const registry = new CoreNodeRegistry();

  registerDefaultNodeDefinitions(registry, {
    // Manager-side: resolve clientId from node config.
    getClientId: () => null,
    getSensorForClientId: (clientId) => {
      if (!clientId) return null;
      return get(sensorData).get(clientId) ?? null;
    },
    executeCommand: () => {
      // Manager always routes via executeCommandForClientId.
    },
    executeCommandForClientId: (clientId, cmd) => {
      if (!clientId) return;
      const sdk = getSDK();
      if (!sdk) return;
      sdk.sendControl(targetClients([clientId]), cmd.action, cmd.payload ?? {}, cmd.executeAt);
    },
  });

  const pick = (type: string): CoreRuntimeImpl => {
    const def = registry.get(type);
    if (!def) {
      throw new Error(`[node-specs] missing core runtime impl: ${type}`);
    }
    return { process: def.process, onSink: def.onSink };
  };

  return new Map<string, CoreRuntimeImpl>([
    ['client-object', pick('client-object')],
    ['proc-client-sensors', pick('proc-client-sensors')],
    ['number', pick('number')],
    ['number-stabilizer', pick('number-stabilizer')],
    ['math', pick('math')],
    ['logic-add', pick('logic-add')],
    ['logic-multiple', pick('logic-multiple')],
    ['logic-subtract', pick('logic-subtract')],
    ['logic-divide', pick('logic-divide')],
    ['logic-if', pick('logic-if')],
    ['logic-for', pick('logic-for')],
    ['logic-sleep', pick('logic-sleep')],
    ['number-script', pick('number-script')],
    ['client-count', pick('client-count')],
    ['array-filter', pick('array-filter')],
    ['tone-osc', pick('tone-osc')],
    ['tone-delay', pick('tone-delay')],
    ['tone-resonator', pick('tone-resonator')],
    ['tone-pitch', pick('tone-pitch')],
    ['tone-reverb', pick('tone-reverb')],
    ['tone-granular', pick('tone-granular')],
    ['play-media', pick('play-media')],
  ]);
})();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null;
}

function clampNumber(value: number, clamp: ClampSpec | undefined): number {
  let next = value;
  const min = clamp?.min;
  const max = clamp?.max;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

// Track MIDI boolean toggles per node (edge-triggered on press).
const midiBooleanState = new Map<string, MidiBooleanState>();
// Track client selection offsets per node (index/range).
const clientSelectionState = new Map<string, ClientSelectionState>();
// Throttle noisy per-frame logs (e.g. showImage streaming).
const displayObjectLogLastAt = new Map<string, number>();

function midiSourceKey(source: MidiSource | null | undefined): string | null {
  if (!source) return null;
  const input = source.inputId ? `in:${source.inputId}` : 'in:*';
  const number = source.type === 'pitchbend' ? 'pb' : String(source.number ?? 0);
  return `${input}|${source.type}|ch:${source.channel}|num:${number}`;
}

function clampInt(value: number, min: number, max: number): number {
  // For selection indices/ranges we want "reach the next integer" behavior, not `.5` rounding.
  const next = Math.floor(value);
  return Math.max(min, Math.min(max, next));
}

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
  return fallback;
}

function selectionEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, idx) => id === b[idx]);
}

function buildAlternatingSelection(clients: string[], index: number, range: number): string[] {
  const total = clients.length;
  const picked: string[] = [];
  const seen = new Set<number>();

  const add = (pos: number) => {
    if (pos < 1 || pos > total) return;
    if (seen.has(pos)) return;
    seen.add(pos);
    picked.push(clients[pos - 1]);
  };

  add(index);
  let offset = 1;
  while (picked.length < range && (index + offset <= total || index - offset >= 1)) {
    add(index + offset);
    if (picked.length >= range) break;
    add(index - offset);
    offset += 1;
  }

  return picked;
}

function pickRandomIds(pool: string[], count: number): string[] {
  if (count <= 0) return [];
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function applyClientSelectionFromInputs(nodeId: string, inputs: Record<string, unknown>): void {
  const indexRaw = inputs.index;
  const rangeRaw = inputs.range;
  const randomRaw = inputs.random;
  const hasIndex = isFiniteNumber(indexRaw);
  const hasRange = isFiniteNumber(rangeRaw);
  const hasRandom = typeof randomRaw === 'boolean' || isFiniteNumber(randomRaw);

  if (!hasIndex && !hasRange && !hasRandom) {
    clientSelectionState.delete(nodeId);
    return;
  }

  const prev =
    clientSelectionState.get(nodeId) ??
    ({
      index: 1,
      range: 1,
      random: false,
      baseRandomIds: [],
      selectedIds: [],
      clientsKey: '',
    } as ClientSelectionState);
  const indexValue = hasIndex ? Number(indexRaw) : prev.index;
  const rangeValue = hasRange ? Number(rangeRaw) : prev.range;
  const randomValue = hasRandom ? coerceBoolean(randomRaw, prev.random) : prev.random;
  if (!Number.isFinite(indexValue) || !Number.isFinite(rangeValue)) return;

  const clients = (get(state).clients ?? []).map((c) => String(c.clientId ?? '')).filter(Boolean);
  if (clients.length === 0) return;

  const total = clients.length;
  const rangeClamped = clampInt(rangeValue, 1, total);
  const start = clampInt(indexValue, 1, total);
  let next: string[] = [];
  let baseRandomIds = prev.baseRandomIds ?? [];
  const clientsKey = clients.join('|');

  if (randomValue) {
    const prevRandom = prev.random ?? false;
    if (!prevRandom || prev.clientsKey !== clientsKey) {
      baseRandomIds = [];
    }

    baseRandomIds = baseRandomIds.filter((id) => clients.includes(id));
    if (baseRandomIds.length > rangeClamped) baseRandomIds = baseRandomIds.slice(0, rangeClamped);

    if (baseRandomIds.length < rangeClamped) {
      const remaining = clients.filter((id) => !baseRandomIds.includes(id));
      const needed = rangeClamped - baseRandomIds.length;
      baseRandomIds = [...baseRandomIds, ...pickRandomIds(remaining, needed)];
    }

    const offset = start - 1;
    const seen = new Set<string>();
    for (const baseId of baseRandomIds) {
      const pos = clients.indexOf(baseId);
      if (pos < 0) continue;
      const nextId = clients[(pos + offset) % total];
      if (!seen.has(nextId)) {
        seen.add(nextId);
        next.push(nextId);
      }
    }
  } else {
    next = buildAlternatingSelection(clients, start, rangeClamped);
  }
  const current = get(state).selectedClientIds.map(String).filter((id) => clients.includes(id));
  const inputsChanged =
    prev.index !== start ||
    prev.range !== rangeClamped ||
    prev.random !== randomValue ||
    prev.clientsKey !== clientsKey;

  let nextIndex = start;
  let nextRange = rangeClamped;
  let shouldSyncSelection = true;

  if (!inputsChanged && !selectionEqual(current, next)) {
    // Treat manual selection as the source of truth until inputs change.
    next = current;
    shouldSyncSelection = false;
    if (next.length > 0) {
      const firstId = next[0];
      const idx = clients.indexOf(firstId);
      if (idx >= 0) nextIndex = idx + 1;
      nextRange = Math.max(1, Math.min(total, next.length));
    }
  }

  if (shouldSyncSelection && !selectionEqual(current, next)) {
    selectClients(next);
  }

  clientSelectionState.set(nodeId, {
    index: nextIndex,
    range: nextRange,
    random: randomValue,
    baseRandomIds,
    selectedIds: next,
    clientsKey,
  });
}

function getSelectedClientIndexOut(): number {
  const clients = (get(state).clients ?? []).map((c) => String(c.clientId ?? '')).filter(Boolean);
  if (clients.length === 0) return 0;
  const selected = get(state).selectedClientIds.map(String);
  const targetId = selected[0];
  if (!targetId) return 0;
  const idx = clients.indexOf(targetId);
  return idx >= 0 ? idx + 1 : 0;
}

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

function createCommandProcess(runtime: CommandRuntime): NodeDefinition['process'] {
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

function createDefinition(spec: NodeSpec & { runtime: NodeRuntime }): NodeDefinition {
  const base: Omit<NodeDefinition, 'process' | 'onSink'> = {
    type: spec.type,
    label: spec.label ?? spec.type,
    category: spec.category ?? 'Other',
    inputs: spec.inputs ?? [],
    outputs: spec.outputs ?? [],
    configSchema: spec.configSchema ?? [],
  };

  switch (spec.runtime.kind) {
    case 'client-object': {
      const impl = coreRuntimeImplByKind.get(spec.runtime.kind);
      if (!impl) {
        throw new Error(`[node-specs] missing core runtime kind: ${spec.runtime.kind}`);
      }
      return {
        ...base,
        process: (inputs, config, context) => {
          applyClientSelectionFromInputs(context.nodeId, inputs);
          const out = impl.process(inputs, config, context);
          const selection = clientSelectionState.get(context.nodeId);
          const indexOut = selection ? selection.index : getSelectedClientIndexOut();
          return { ...out, indexOut };
        },
        onSink: (inputs, config, context) => {
          applyClientSelectionFromInputs(context.nodeId, inputs);

          const clients = (get(state).clients ?? []).map((c) => String(c.clientId ?? '')).filter(Boolean);
          if (clients.length === 0) return;

          const selection = clientSelectionState.get(context.nodeId);
          const selectedIds =
            selection && selection.selectedIds.length > 0
              ? selection.selectedIds
              : get(state).selectedClientIds.map(String).filter(Boolean);

          const fallbackClientId = typeof config.clientId === 'string' ? String(config.clientId) : '';
          const targets = selectedIds.length > 0 ? selectedIds : fallbackClientId ? [fallbackClientId] : [];
          if (targets.length === 0) return;

          const raw = inputs.in;
          const commands = (Array.isArray(raw) ? raw : [raw]) as unknown[];
          if (commands.length === 0) return;

          const sdk = getSDK();
          if (!sdk) return;

          for (const cmd of commands) {
            const cmdRecord = asRecord(cmd);
            if (!cmdRecord) continue;
            const actionRaw = cmdRecord.action;
            if (typeof actionRaw !== 'string') continue;
            const action = actionRaw as ControlAction;
            const payloadRecord = asRecord(cmdRecord.payload) ?? {};
            const payload = payloadRecord as ControlPayload;
            const executeAt = typeof cmdRecord.executeAt === 'number' ? cmdRecord.executeAt : undefined;

            for (const clientId of targets) {
              sdk.sendControl(targetClients([clientId]), action, payload, executeAt);
            }
          }
        },
      };
    }
    case 'display-object': {
      return {
        ...base,
        process: () => ({}),
        onSink: (inputs, _config, context) => {
          const raw = inputs.in;
          const commands = (Array.isArray(raw) ? raw : [raw]) as unknown[];
          if (commands.length === 0) return;

          const sdk = getSDK();
          const availability = displayTransport.getAvailability();
          if (!availability.hasLocalSession && !sdk) return;

          if (import.meta.env.DEV && !availability.hasLocalSession && !availability.hasRemoteDisplay) {
            const nodeKey = typeof context?.nodeId === 'string' ? context.nodeId : 'display-object';
            const warnKey = `warn:${nodeKey}`;
            const now = Date.now();
            const lastAt = displayObjectLogLastAt.get(warnKey) ?? 0;
            if (now - lastAt >= 1500) {
              displayObjectLogLastAt.set(warnKey, now);
              console.warn('[Manager] display-object: no Display target (open Display app or pair local Display).');
            }
          }

          for (const cmd of commands) {
            const cmdRecord = asRecord(cmd);
            if (!cmdRecord) continue;
            const actionRaw = cmdRecord.action;
            if (typeof actionRaw !== 'string') continue;
            const action = actionRaw as ControlAction;
            const payloadRecord = asRecord(cmdRecord.payload) ?? {};
            const payload = payloadRecord as ControlPayload;
            const executeAt = typeof cmdRecord.executeAt === 'number' ? cmdRecord.executeAt : undefined;

            const sendResult = displayTransport.sendControl(action, payload, executeAt);

            if (import.meta.env.DEV && (action === 'showImage' || action === 'hideImage')) {
              const nodeKey = typeof context?.nodeId === 'string' ? context.nodeId : 'display-object';
              const now = Date.now();
              const lastAt = displayObjectLogLastAt.get(nodeKey) ?? 0;
              if (now - lastAt >= 500) {
                displayObjectLogLastAt.set(nodeKey, now);
                const urlCandidate = (payload as Record<string, unknown>)?.url;
                const url = typeof urlCandidate === 'string' ? urlCandidate : '';
                console.info('[Manager] display-object', {
                  nodeId: context?.nodeId,
                  via: sendResult.route,
                  action,
                  urlChars: url ? url.length : null,
                });
              }
            }
          }
        },
        onDisable: () => {
          // Clear any long-lived effects when the Display route is disabled (e.g. group gate closed / graph stop).
          displayTransport.sendControl('stopMedia', {}, undefined);
          displayTransport.sendControl('hideImage', {}, undefined);
          displayTransport.sendControl(
            'screenColor',
            { color: '#000000', opacity: 0, mode: 'solid' },
            undefined
          );
        },
      };
    }
    case 'group-frame': {
      return {
        ...base,
        process: () => ({}),
      };
    }
    case 'logic-number-to-boolean': {
      return {
        ...base,
        process: (inputs) => {
          const numberRaw = inputs.number;
          const triggerRaw = inputs.trigger;

          const numberValue = isFiniteNumber(numberRaw) ? numberRaw : Number(numberRaw ?? 0);
          const triggerValue = isFiniteNumber(triggerRaw) ? triggerRaw : Number(triggerRaw ?? 0.5);

          const threshold = Number.isFinite(triggerValue) ? triggerValue : 0.5;
          const current = Number.isFinite(numberValue) ? numberValue : 0;

          return { out: current >= threshold };
        },
      };
    }
    case 'proc-client-sensors':
    case 'number':
    case 'number-stabilizer':
    case 'math':
    case 'logic-add':
    case 'logic-multiple':
    case 'logic-subtract':
    case 'logic-divide':
    case 'logic-if':
    case 'logic-for':
    case 'logic-sleep':
    case 'number-script':
    case 'client-count':
    case 'array-filter':
    case 'tone-osc':
    case 'play-media':
    {
      const impl = coreRuntimeImplByKind.get(spec.runtime.kind);
      if (!impl) {
        throw new Error(`[node-specs] missing core runtime kind: ${spec.runtime.kind}`);
      }
      return {
        ...base,
        process: impl.process,
        ...(impl.onSink ? { onSink: impl.onSink } : {}),
      };
    }
    case 'tone-delay':
    case 'tone-resonator':
    case 'tone-pitch':
    case 'tone-reverb':
    case 'tone-granular': {
      const impl = coreRuntimeImplByKind.get(spec.runtime.kind);
      if (!impl) {
        throw new Error(`[node-specs] missing core runtime kind: ${spec.runtime.kind}`);
      }
      return {
        ...base,
        process: impl.process,
        ...(impl.onSink ? { onSink: impl.onSink } : {}),
      };
    }
    case 'param-get': {
      return {
        ...base,
        process: (_inputs, config) => {
          const path = String(config.path ?? '');
          if (!path) return { value: 0 };
          const param = parameterRegistry.get<number>(path);
          if (!param) return { value: 0 };
          return { value: param.effectiveValue };
        },
      };
    }
    case 'param-set': {
      return {
        ...base,
        process: (inputs, config, context: ProcessContext) => {
          const path = String(config.path ?? '');
          const modeRaw =
            typeof inputs.mode === 'string' && String(inputs.mode).trim()
              ? String(inputs.mode).trim()
              : String(config.mode ?? 'REMOTE');
          const mode = modeRaw === 'MODULATION' ? 'MODULATION' : 'REMOTE';
          const value =
            typeof inputs.value === 'number' && Number.isFinite(inputs.value)
              ? inputs.value
              : Number(inputs.value ?? 0);
          const bypass = typeof inputs.bypass === 'boolean' ? inputs.bypass : Boolean(inputs.bypass ?? false);

          if (!path || bypass) return { value };

          const param = parameterRegistry.get<number>(path);
          if (!param) return { value };

          if (mode === 'REMOTE') {
            param.setValue(value, 'NODE');
          } else {
            const offset = value - param.baseValue;
            param.setModulation(`node-${context.nodeId}`, offset, 'NODE');
          }

          return { value };
        },
      };
    }
    case 'midi-fuzzy': {
      return {
        ...base,
        process: (_inputs, config) => {
          const source = (config.source ?? null) as MidiSource | null;
          const normalized = midiNodeBridge.getNormalized(source);
          return { value: normalized ?? 0 };
        },
      };
    }
    case 'midi-boolean': {
      return {
        ...base,
        process: (inputs, config, context) => {
          const source = (config.source ?? null) as MidiSource | null;
          const key = midiSourceKey(source);
          const buttonize = coerceBoolean(config.buttonize, true);
          const thresholdFromInput = inputs.threshold;
          const thresholdRaw =
            typeof thresholdFromInput === 'number' && Number.isFinite(thresholdFromInput)
              ? thresholdFromInput
              : Number(config.threshold ?? 0.5);
          const threshold = Number.isFinite(thresholdRaw) ? thresholdRaw : 0.5;

          if (!source || !key) {
            midiBooleanState.delete(context.nodeId);
            return { value: false };
          }

          const state =
            midiBooleanState.get(context.nodeId) ??
            ({
              value: false,
              lastPressed: false,
              sourceKey: key,
            } as MidiBooleanState);

          if (state.sourceKey !== key) {
            state.value = false;
            state.lastPressed = false;
            state.sourceKey = key;
          }

          const event = midiNodeBridge.getEvent(source);
          if (!event) {
            state.lastPressed = false;
            midiBooleanState.set(context.nodeId, state);
            return { value: state.value };
          }

          const pressed =
            event.type === 'note' ? Boolean(event.isPress) : event.normalized >= threshold;

          if (buttonize) {
            if (pressed && !state.lastPressed) {
              state.value = !state.value;
            }
          } else {
            state.value = pressed;
          }

          state.lastPressed = pressed;
          midiBooleanState.set(context.nodeId, state);

          return { value: state.value };
        },
      };
    }
    case 'group-activate': {
      return {
        ...base,
        process: (inputs) => {
          const raw = inputs.active;
          const active =
            typeof raw === 'boolean'
              ? raw
              : typeof raw === 'number' && Number.isFinite(raw)
                ? raw >= 0.5
                : true;
          return { active };
        },
      };
    }
    case 'midi-map': {
      return {
        ...base,
        process: (inputs, config) => {
          const value = typeof inputs.in === 'number' ? (inputs.in as number) : null;
          if (value === null || !Number.isFinite(value)) return { out: null };

          const minInput = inputs.min;
          const maxInput = inputs.max;
          const minRaw = typeof minInput === 'number' ? minInput : Number(config.min ?? 0);
          const maxRaw = typeof maxInput === 'number' ? maxInput : Number(config.max ?? 1);
          const min = Number.isFinite(minRaw) ? minRaw : 0;
          const max = Number.isFinite(maxRaw) ? maxRaw : 1;
          const invert = coerceBoolean(inputs.invert, Boolean(config.invert));
          const round = coerceBoolean(inputs.round, Boolean(config.round));
          // Integer output helper: avoids float inputs for discrete targets (e.g. client index/range).
          const integer = coerceBoolean(inputs.integer, Boolean(config.integer));

          const mapped = mapRangeWithOptions(value, min, max, invert);
          const out = integer || round ? Math.round(mapped) : mapped;
          return { out };
        },
      };
    }
    case 'midi-select-map': {
      const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

      return {
        ...base,
        process: (inputs, config) => {
          const value = typeof inputs.in === 'number' ? (inputs.in as number) : null;
          if (value === null || !Number.isFinite(value)) return { out: null };

          const invert = coerceBoolean(inputs.invert, Boolean(config.invert));
          const rawOptions = Array.isArray(config.options) ? config.options : [];
          const options = rawOptions.map((opt) => String(opt)).filter((opt) => opt !== '');

          const t = clamp01(invert ? 1 - value : value);
          if (options.length === 0) return { out: null };

          const idx = Math.min(options.length - 1, Math.floor(t * options.length));
          return { out: options[idx] ?? null };
        },
      };
    }
    case 'midi-color-map': {
      type Rgb = { r: number; g: number; b: number };

      const clamp01 = (v: number): number => {
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
      };

      const parseHexColor = (value: unknown): Rgb | null => {
        if (typeof value !== 'string') return null;
        const raw = value.trim();
        if (!raw) return null;
        const hex = raw.startsWith('#') ? raw.slice(1) : raw;

        const isShort = hex.length === 3;
        const isFull = hex.length === 6;
        if (!isShort && !isFull) return null;
        if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

        const full = isShort ? hex.split('').map((c) => c + c).join('') : hex;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        if (![r, g, b].every((n) => Number.isFinite(n))) return null;
        return { r, g, b };
      };

      const toHex = ({ r, g, b }: Rgb): string => {
        const cl = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
        return (
          '#' +
          [cl(r), cl(g), cl(b)]
            .map((n) => n.toString(16).padStart(2, '0'))
            .join('')
            .toLowerCase()
        );
      };

      const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

      return {
        ...base,
        process: (inputs, config) => {
          const raw = typeof inputs.in === 'number' ? (inputs.in as number) : 0;
          const invert = coerceBoolean(inputs.invert, Boolean(config.invert));
          const t = invert ? 1 - clamp01(raw) : clamp01(raw);

          const fromInput = inputs.from;
          const toInput = inputs.to;
          const fromRaw = typeof fromInput === 'string' && fromInput.trim() ? fromInput.trim() : (config.from ?? '#6366f1');
          const toRaw = typeof toInput === 'string' && toInput.trim() ? toInput.trim() : (config.to ?? '#ffffff');
          const from = parseHexColor(fromRaw) ?? parseHexColor('#6366f1');
          const to = parseHexColor(toRaw) ?? parseHexColor('#ffffff');
          if (!from || !to) return { out: null };

          const out: Rgb = { r: lerp(from.r, to.r, t), g: lerp(from.g, to.g, t), b: lerp(from.b, to.b, t) };
          return { out: toHex(out) };
        },
      };
    }
    case 'command': {
      return {
        ...base,
        process: createCommandProcess(spec.runtime),
      };
    }
  }
}

function applySpecOverlay(base: NodeDefinition, spec: NodeSpec): NodeDefinition {
  const nextLabel = typeof spec.label === 'string' && spec.label.trim() ? spec.label.trim() : base.label;
  const nextCategory =
    typeof spec.category === 'string' && spec.category.trim() ? spec.category.trim() : base.category;

  const mergeMin = (baseMin: number | undefined, overlayMin: unknown): number | undefined => {
    const ov = isFiniteNumber(overlayMin) ? overlayMin : undefined;
    if (ov === undefined) return baseMin;
    if (baseMin === undefined) return ov;
    return Math.max(baseMin, ov);
  };

  const mergeMax = (baseMax: number | undefined, overlayMax: unknown): number | undefined => {
    const ov = isFiniteNumber(overlayMax) ? overlayMax : undefined;
    if (ov === undefined) return baseMax;
    if (baseMax === undefined) return ov;
    return Math.min(baseMax, ov);
  };

  const mergeStep = (baseStep: number | undefined, overlayStep: unknown): number | undefined => {
    const ov = isFiniteNumber(overlayStep) ? overlayStep : undefined;
    if (ov === undefined || ov <= 0) return baseStep;
    return ov;
  };

  const mergePorts = (basePorts: NodePort[], overlayPorts: unknown): NodePort[] => {
    if (!Array.isArray(overlayPorts) || overlayPorts.length === 0) return basePorts;

    const byId = new Map<string, AnyRecord>();
    for (const raw of overlayPorts) {
      const record = asRecord(raw);
      if (!record) continue;
      const id = typeof record.id === 'string' ? String(record.id) : '';
      if (!id) continue;
      byId.set(id, record);
    }

    return basePorts.map((port) => {
      const overlay = byId.get(String(port.id));
      if (!overlay) return port;
      const overlayType = typeof overlay.type === 'string' ? String(overlay.type) : '';
      if (overlayType && overlayType !== String(port.type)) return port;

      const label =
        typeof overlay.label === 'string' && overlay.label.trim() ? overlay.label.trim() : port.label;

      const min = mergeMin(port.min, overlay.min);
      const max = mergeMax(port.max, overlay.max);
      const step = mergeStep(port.step, overlay.step);

      const safeMin = min !== undefined && max !== undefined && min > max ? port.min : min;
      const safeMax = min !== undefined && max !== undefined && min > max ? port.max : max;

      return { ...port, label, min: safeMin, max: safeMax, step };
    });
  };

  const mergeConfigSchema = (baseSchema: ConfigField[], overlaySchema: unknown): ConfigField[] => {
    if (!Array.isArray(overlaySchema) || overlaySchema.length === 0) return baseSchema;

    const byKey = new Map<string, AnyRecord>();
    for (const raw of overlaySchema) {
      const record = asRecord(raw);
      if (!record) continue;
      const key = typeof record.key === 'string' ? String(record.key) : '';
      if (!key) continue;
      byKey.set(key, record);
    }

    return baseSchema.map((field) => {
      const overlay = byKey.get(String(field.key));
      if (!overlay) return field;
      const overlayType = typeof overlay.type === 'string' ? String(overlay.type) : '';
      if (overlayType && overlayType !== String(field.type)) return field;

      const label =
        typeof overlay.label === 'string' && overlay.label.trim() ? overlay.label.trim() : field.label;

      const min = mergeMin(field.min, overlay.min);
      const max = mergeMax(field.max, overlay.max);
      const step = mergeStep(field.step, overlay.step);

      const safeMin = min !== undefined && max !== undefined && min > max ? field.min : min;
      const safeMax = min !== undefined && max !== undefined && min > max ? field.max : max;

      return { ...field, label, min: safeMin, max: safeMax, step };
    });
  };

  return {
    ...base,
    label: nextLabel,
    category: nextCategory,
    inputs: mergePorts(base.inputs, spec.inputs),
    outputs: mergePorts(base.outputs, spec.outputs),
    configSchema: mergeConfigSchema(base.configSchema, spec.configSchema),
  };
}

function loadSpecs(): NodeSpec[] {
  const modules = import.meta.glob('./**/*.json', { eager: true }) as Record<string, { default: unknown }>;
  const specs: NodeSpec[] = [];

  for (const mod of Object.values(modules)) {
    const spec = mod?.default;
    if (!spec || typeof spec !== 'object') continue;
    const type = typeof spec.type === 'string' ? spec.type.trim() : '';
    if (!type) continue;
    specs.push(spec as NodeSpec);
  }

  // Stable order for debugging/determinism.
  specs.sort((a, b) => a.type.localeCompare(b.type));
  return specs;
}

// Register on import.
registerDefaultNodeDefinitions(nodeRegistry, {
  // Manager-side: resolve clientId from node config.
  getClientId: () => null,
  // Client node selection should only enumerate audience clients; Display has its own `display-object` node.
  getAllClientIds: () =>
    (get(state).clients ?? [])
      .filter((c) => String(c?.group ?? '') !== 'display')
      .map((c) => String(c?.clientId ?? ''))
      .filter(Boolean),
  // Decouple Node Graph client targeting from Manager UI "selected clients".
  // Client targeting must be driven by the graph itself (client-object inputs/config).
  getSelectedClientIds: () => [],
  getSensorForClientId: (clientId: string) => {
    if (!clientId) return null;
    return get(sensorData).get(clientId) ?? null;
  },
  getImageForClientId: (clientId: string) => {
    if (!clientId) return null;
    return get(clientScreenshotUploads).get(clientId)?.dataUrl ?? null;
  },
  executeCommand: () => {
    // Manager always routes via executeCommandForClientId.
  },
  executeCommandForClientId: (clientId: string, cmd: NodeCommand) => {
    if (!clientId) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendControl(targetClients([clientId]), cmd.action, cmd.payload ?? {}, cmd.executeAt);
  },
});

// Backward-compatible fallback: `load-audio-from-assets` is a newer convenience node.
// If a dev environment is running with stale node-core builds, templates may fail to import.
// Register a minimal definition here so graphs can still load (node-core remains the SOT when available).
if (!nodeRegistry.get('load-audio-from-assets')) {
  nodeRegistry.register({
    type: 'load-audio-from-assets',
    label: 'Load Audio From Remote',
    category: 'Assets',
    inputs: [
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'cursorSec', label: 'Cursor (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
    ],
    outputs: [
      { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetId',
        label: 'Audio Asset',
        type: 'asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    process: (inputs, config) => {
      const assetId = typeof config.assetId === 'string' ? String(config.assetId).trim() : '';
      const playRaw = inputs.play;
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      // Manager-side placeholder: the actual audio playback is implemented on the client runtime.
      // Return a simple gate value so downstream nodes can reflect play/pause state.
      return { ref: assetId && play ? 1 : 0, ended: false };
    },
  });
}

if (!nodeRegistry.get('load-image-from-assets')) {
  nodeRegistry.register({
    type: 'load-image-from-assets',
    label: 'Load Image From Remote',
    category: 'Assets',
    inputs: [],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetId',
        label: 'Image Asset',
        type: 'asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (_inputs, config) => {
      const assetId =
        typeof config.assetId === 'string' ? String(config.assetId).trim() : '';
      const fitRaw =
        typeof config.fit === 'string'
          ? String(config.fit).trim().toLowerCase()
          : '';
      const fit =
        fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';
      const fitHash = fit !== 'contain' ? `#fit=${fit}` : '';
      return { ref: assetId ? `asset:${assetId}${fitHash}` : '' };
    },
  });
}

if (!nodeRegistry.get('load-video-from-assets')) {
  nodeRegistry.register({
    type: 'load-video-from-assets',
    label: 'Load Video From Remote',
    category: 'Assets',
    inputs: [
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'cursorSec', label: 'Cursor (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      { id: 'muted', label: 'Mute', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'ref', label: 'Video Out', type: 'video', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetId',
        label: 'Video Asset',
        type: 'asset-picker',
        assetKind: 'video',
        defaultValue: '',
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (inputs, config) => {
      const assetId = typeof config.assetId === 'string' ? String(config.assetId).trim() : '';
      const fitRaw = typeof config.fit === 'string' ? String(config.fit).trim().toLowerCase() : '';
      const fit = fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';
      const startSec =
        typeof inputs.startSec === 'number' && Number.isFinite(inputs.startSec)
          ? Number(inputs.startSec)
          : 0;
      const endSec =
        typeof inputs.endSec === 'number' && Number.isFinite(inputs.endSec)
          ? Number(inputs.endSec)
          : -1;
      const cursorSec =
        typeof inputs.cursorSec === 'number' && Number.isFinite(inputs.cursorSec)
          ? Number(inputs.cursorSec)
          : -1;

      const loopRaw = inputs.loop;
      const playRaw = inputs.play;
      const loop = typeof loopRaw === 'number' ? loopRaw >= 0.5 : Boolean(loopRaw);
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      const reverseRaw = inputs.reverse;
      const reverse = typeof reverseRaw === 'number' ? reverseRaw >= 0.5 : Boolean(reverseRaw);
      const mutedRaw = inputs.muted;
      const muted = typeof mutedRaw === 'number' ? mutedRaw >= 0.5 : Boolean(mutedRaw);
      const volumeRaw = inputs.volume;
      const volumeParam = typeof volumeRaw === 'string' ? Number(volumeRaw) : Number(volumeRaw);
      const volumeValue = Number.isFinite(volumeParam) ? Math.max(-1, Math.min(100, volumeParam)) : 0;
      const volumeGain =
        volumeValue <= -1
          ? 0
          : volumeValue < 0
            ? 1 + volumeValue
            : volumeValue <= 2
              ? 1 + volumeValue / 2
              : volumeValue;
      const volumeRounded = Math.round(volumeGain * 100) / 100;
      const mutedEffective = muted || volumeRounded <= 0;

      const startClamped = Math.max(0, startSec);
      const endClamped = endSec >= 0 ? Math.max(startClamped, endSec) : -1;
      const tValue = endClamped >= 0 ? `${startClamped},${endClamped}` : `${startClamped},`;

      const cursorClamped = cursorSec >= 0 ? Math.max(startClamped, cursorSec) : -1;
      const positionParam =
        cursorClamped >= 0 ? `&p=${endClamped >= 0 ? Math.min(endClamped, cursorClamped) : cursorClamped}` : '';
      const fitParam = fit !== 'contain' ? `&fit=${fit}` : '';

      return {
        ref: assetId
          ? `asset:${assetId}#t=${tValue}&loop=${loop ? 1 : 0}&play=${play ? 1 : 0}&rev=${reverse ? 1 : 0}&vol=${volumeRounded}&muted=${mutedEffective ? 1 : 0}${positionParam}${fitParam}`
          : '',
        ended: false,
      };
    },
  });
}

const ensureLocalMediaKindQuery = (ref: string, kind: 'audio' | 'image' | 'video'): string => {
  const hashIndex = ref.indexOf('#');
  const hash = hashIndex >= 0 ? ref.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;

  const qIndex = withoutHash.indexOf('?');
  if (qIndex < 0) return `${withoutHash}?kind=${kind}${hash}`;

  const base = withoutHash.slice(0, qIndex);
  const search = withoutHash.slice(qIndex + 1);
  try {
    const params = new URLSearchParams(search);
    if (!params.has('kind')) params.set('kind', kind);
    return `${base}?${params.toString()}${hash}`;
  } catch {
    const joiner = withoutHash.endsWith('?') || withoutHash.endsWith('&') ? '' : '&';
    return `${withoutHash}${joiner}kind=${kind}${hash}`;
  }
};

const normalizeLocalMediaRef = (raw: string, kind: 'audio' | 'image' | 'video'): string => {
  const s = raw.trim();
  if (!s) return '';

  if (s.startsWith('displayfile:')) {
    return ensureLocalMediaKindQuery(s, kind);
  }

  if (s.startsWith('localfile:')) {
    return ensureLocalMediaKindQuery(s, kind);
  }

  const shuguLocalPrefix = 'shugu://local-file/';
  if (s.startsWith(shuguLocalPrefix)) {
    const filePath = s.slice(shuguLocalPrefix.length).trim();
    if (!filePath) return '';
    return ensureLocalMediaKindQuery(`localfile:${filePath}`, kind);
  }

  if (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('asset:') ||
    s.startsWith('shugu://asset/')
  ) {
    return ensureLocalMediaKindQuery(s, kind);
  }

  return ensureLocalMediaKindQuery(`localfile:${s}`, kind);
};

if (!nodeRegistry.get('load-audio-from-local')) {
  nodeRegistry.register({
    type: 'load-audio-from-local',
    label: 'Load Audio From Local(Display only)',
    category: 'Assets',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'string', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'cursorSec', label: 'Cursor (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
    ],
    outputs: [
      { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Audio Asset',
        type: 'local-asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    process: (inputs, config) => {
      const asset =
        typeof inputs.asset === 'string' && String(inputs.asset).trim()
          ? String(inputs.asset).trim()
          : typeof config.assetPath === 'string'
            ? String(config.assetPath).trim()
            : '';
      const playRaw = inputs.play;
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      return { ref: asset && play ? 1 : 0, ended: false };
    },
  });
}

if (!nodeRegistry.get('load-image-from-local')) {
  nodeRegistry.register({
    type: 'load-image-from-local',
    label: 'Load Image From Local(Display only)',
    category: 'Assets',
    inputs: [{ id: 'asset', label: 'Asset', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Image Asset',
        type: 'local-asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (inputs, config) => {
      const baseUrl =
        typeof inputs.asset === 'string' && String(inputs.asset).trim()
          ? String(inputs.asset).trim()
          : typeof config.assetPath === 'string'
            ? String(config.assetPath).trim()
            : '';
      const baseRef = baseUrl ? normalizeLocalMediaRef(baseUrl, 'image') : '';
      const fitRaw =
        typeof config.fit === 'string'
          ? String(config.fit).trim().toLowerCase()
          : '';
      const fit =
        fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';
      const fitHash = fit !== 'contain' ? `#fit=${fit}` : '';
      if (!baseRef) return { ref: '' };
      if (!fitHash) return { ref: baseRef };
      const hashIndex = baseRef.indexOf('#');
      if (hashIndex < 0) return { ref: `${baseRef}${fitHash}` };
      const withoutHash = baseRef.slice(0, hashIndex);
      const params = new URLSearchParams(baseRef.slice(hashIndex + 1));
      params.set('fit', fit);
      return { ref: `${withoutHash}#${params.toString()}` };
    },
  });
}

if (!nodeRegistry.get('load-video-from-local')) {
  nodeRegistry.register({
    type: 'load-video-from-local',
    label: 'Load Video From Local(Display only)',
    category: 'Assets',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'string', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'cursorSec', label: 'Cursor (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      { id: 'muted', label: 'Mute', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'ref', label: 'Video Out', type: 'video', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Video Asset',
        type: 'local-asset-picker',
        assetKind: 'video',
        defaultValue: '',
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (inputs, config, context) => {
      const assetUrl =
        typeof inputs.asset === 'string' && String(inputs.asset).trim()
          ? String(inputs.asset).trim()
          : typeof config.assetPath === 'string'
            ? String(config.assetPath).trim()
            : '';
      const localRef = assetUrl ? normalizeLocalMediaRef(assetUrl, 'video') : '';
      const fitRaw = typeof config.fit === 'string' ? String(config.fit).trim().toLowerCase() : '';
      const fit = fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';

      const startSec =
        typeof inputs.startSec === 'number' && Number.isFinite(inputs.startSec)
          ? Number(inputs.startSec)
          : 0;
      const endSec =
        typeof inputs.endSec === 'number' && Number.isFinite(inputs.endSec)
          ? Number(inputs.endSec)
          : -1;
      const cursorSec =
        typeof inputs.cursorSec === 'number' && Number.isFinite(inputs.cursorSec)
          ? Number(inputs.cursorSec)
          : -1;

      const loopRaw = inputs.loop;
      const playRaw = inputs.play;
      const reverseRaw = inputs.reverse;
      const mutedRaw = inputs.muted;
      const loop = typeof loopRaw === 'number' ? loopRaw >= 0.5 : Boolean(loopRaw);
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      const reverse = typeof reverseRaw === 'number' ? reverseRaw >= 0.5 : Boolean(reverseRaw);
      const muted = typeof mutedRaw === 'number' ? mutedRaw >= 0.5 : Boolean(mutedRaw);
      const volumeRaw = inputs.volume;
      const volumeParam = typeof volumeRaw === 'string' ? Number(volumeRaw) : Number(volumeRaw);
      const volumeValue = Number.isFinite(volumeParam) ? Math.max(-1, Math.min(100, volumeParam)) : 0;
      const volumeGain =
        volumeValue <= -1
          ? 0
          : volumeValue < 0
            ? 1 + volumeValue
            : volumeValue <= 2
              ? 1 + volumeValue / 2
              : volumeValue;
      const volumeRounded = Math.round(volumeGain * 100) / 100;
      const mutedEffective = muted || volumeRounded <= 0;

      const startClamped = Math.max(0, startSec);
      const endClamped = endSec >= 0 ? Math.max(startClamped, endSec) : -1;
      const tValue = endClamped >= 0 ? `${startClamped},${endClamped}` : `${startClamped},`;

      const cursorClamped = cursorSec >= 0 ? Math.max(startClamped, cursorSec) : -1;
      const positionParam =
        cursorClamped >= 0 ? `&p=${endClamped >= 0 ? Math.min(endClamped, cursorClamped) : cursorClamped}` : '';
      const nodeParam = context?.nodeId ? `&node=${encodeURIComponent(String(context.nodeId))}` : '';
      const fitParam = fit !== 'contain' ? `&fit=${fit}` : '';

      const baseUrl = (() => {
        if (!localRef) return '';
        const hashIndex = localRef.indexOf('#');
        return hashIndex >= 0 ? localRef.slice(0, hashIndex) : localRef;
      })();

      return {
        ref: baseUrl
          ? `${baseUrl}#t=${tValue}&loop=${loop ? 1 : 0}&play=${play ? 1 : 0}&rev=${reverse ? 1 : 0}&vol=${volumeRounded}&muted=${mutedEffective ? 1 : 0}${positionParam}${nodeParam}${fitParam}`
          : '',
        ended: false,
      };
    },
  });
}

for (const spec of loadSpecs()) {
  try {
    const type = String(spec.type ?? '');
    if (!type) continue;

    const existing = nodeRegistry.get(type);
    if (existing) {
      nodeRegistry.register(applySpecOverlay(existing, spec));
      continue;
    }

    // Manager-only node (not in node-core): still defined via JSON runtime.kind (backward-compatible path).
    const runtimeRecord = asRecord(spec.runtime);
    if (!runtimeRecord || typeof runtimeRecord.kind !== 'string') {
      console.warn('[node-specs] missing runtime.kind for manager-only spec:', type);
      continue;
    }
    if (!spec.label || !spec.category) {
      console.warn('[node-specs] missing label/category for manager-only spec:', type);
      continue;
    }

    nodeRegistry.register(createDefinition(spec as NodeSpec & { runtime: NodeRuntime }));
  } catch (err) {
    console.warn('[node-specs] failed to register', spec?.type, err);
  }
}
