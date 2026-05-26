/**
 * Purpose: Create manager NodeDefinition objects from JSON node specs.
 */
import { get } from 'svelte/store';
import { getCommandArrayDiffMetadata } from '@shugu/node-core';
import { type ControlAction, type ControlPayload } from '@shugu/protocol';
import type { NodeDefinition, ProcessContext } from '../../types';
import { parameterRegistry } from '$lib/parameters/registry';
import { displayTransport, getSDK, state } from '$lib/stores/manager';
import { nodeEngine } from '$lib/nodes/engine';
import { midiNodeBridge, type MidiSource } from '$lib/features/midi/midi-node-bridge';
import { mapRangeWithOptions } from '$lib/features/midi/midi-math';
import { displayObjectLogLastAt, midiBooleanState, midiSourceKey } from './client-selection';
import { createCommandProcess } from './command-mapping';
import { coreRuntimeImplByKind } from './core-runtime';
import { cleanupDisplayActionFor, sendDisplayNodeCommand } from './display-targets';
import { asRecord, coerceBoolean, isFiniteNumber } from './helpers';
import type { MidiBooleanState, NodeRuntime, NodeSpec } from './types';

export function createDefinition(spec: NodeSpec & { runtime: NodeRuntime }): NodeDefinition {
  const base: Omit<NodeDefinition, 'process' | 'onSink'> = {
    type: spec.type,
    label: spec.label ?? spec.type,
    category: spec.category ?? 'Other',
    metadata: spec.metadata as NodeDefinition['metadata'],
    inputs: spec.inputs ?? [],
    outputs: spec.outputs ?? [],
    configSchema: spec.configSchema ?? [],
  };

  switch (spec.runtime.kind) {
    case 'client-loader':
    case 'client-executor':
    case 'url-session':
    case 'url-to-qr-generator':
    case 'gpt-image-gen': {
      const impl = coreRuntimeImplByKind.get(spec.runtime.kind);
      if (!impl) {
        throw new Error(`[node-specs] missing core runtime kind: ${spec.runtime.kind}`);
      }
      return { ...base, ...impl };
    }
    case 'display-object': {
      return {
        ...base,
        process: () => ({}),
        onSink: (inputs, config, context) => {
          const raw = inputs.in;
          const commands = (Array.isArray(raw) ? raw : [raw]) as unknown[];
          if (commands.length === 0) return;

          const sdk = getSDK();
          const selectedDisplayId = typeof config.displayId === 'string' ? String(config.displayId).trim() : '';
          const availability = displayTransport.getAvailability();
          const nodeId = typeof context?.nodeId === 'string' ? context.nodeId : 'display-object';
          const runtimeNode = nodeEngine.getNode(nodeId);
          const graphState = get(nodeEngine.graphState);
          const computedInputs = nodeEngine.getLastComputedInputs(nodeId);
          if (selectedDisplayId) {
            if (!sdk) return;
          } else if (!availability.hasLocalSession && !sdk) return;

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

          const activeActions = new Set<ControlAction>();
          const commandDiff = getCommandArrayDiffMetadata(raw);
          if (commandDiff) {
            for (const action of commandDiff.currentActions) activeActions.add(action as ControlAction);
          }
          for (const cmd of commands) {
            const cmdRecord = asRecord(cmd);
            const actionRaw = cmdRecord?.action;
            if (!commandDiff && typeof actionRaw === 'string' && actionRaw !== '__commandRemoved') {
              activeActions.add(actionRaw as ControlAction);
            }
          }

          for (const cmd of commands) {
            const cmdRecord = asRecord(cmd);
            if (!cmdRecord) continue;
            const actionRaw = cmdRecord.action;
            if (typeof actionRaw !== 'string') continue;
            if (actionRaw === '__commandRemoved') {
              const removedPayload = asRecord(cmdRecord.payload);
              const removedActionRaw = removedPayload?.action;
              if (typeof removedActionRaw !== 'string') continue;
              const cleanup = cleanupDisplayActionFor(removedActionRaw as ControlAction);
              if (!cleanup) continue;
              sendDisplayNodeCommand({
                nodeId,
                clients: (get(state).clients ?? []).map((client) => ({
                  clientId: String(client.clientId ?? ''),
                  group: String(client.group ?? ''),
                  connected: client.connected !== false,
                })),
                node: runtimeNode
                  ? {
                      config: runtimeNode.config as Record<string, unknown>,
                      inputValues: runtimeNode.inputValues as Record<string, unknown>,
                    }
                  : selectedDisplayId
                    ? { config: { displayId: selectedDisplayId }, inputValues: {} }
                    : null,
                computedInputs,
                graph: graphState,
                action: cleanup.action,
                activeActions,
                payload: cleanup.payload,
                executeAt: undefined,
                sendLocalControl: (nextAction, nextPayload, nextExecuteAt) =>
                  displayTransport.sendControl(nextAction, nextPayload, nextExecuteAt),
                sendDisplayOperation: sdk ? (operation) => sdk.sendDisplayOperation(operation) : undefined,
              });
              continue;
            }
            const action = actionRaw as ControlAction;
            const payloadRecord = asRecord(cmdRecord.payload) ?? {};
            const payload = payloadRecord as ControlPayload;
            const executeAt = typeof cmdRecord.executeAt === 'number' ? cmdRecord.executeAt : undefined;

            const sendResult = sendDisplayNodeCommand({
              nodeId,
              clients: (get(state).clients ?? []).map((client) => ({
                clientId: String(client.clientId ?? ''),
                group: String(client.group ?? ''),
                connected: client.connected !== false,
              })),
              node: runtimeNode
                ? {
                    config: runtimeNode.config as Record<string, unknown>,
                    inputValues: runtimeNode.inputValues as Record<string, unknown>,
                  }
                : selectedDisplayId
                  ? { config: { displayId: selectedDisplayId }, inputValues: {} }
                  : null,
              computedInputs,
              graph: graphState,
              action,
              activeActions,
              payload,
              executeAt,
              sendLocalControl: (nextAction, nextPayload, nextExecuteAt) =>
                displayTransport.sendControl(nextAction, nextPayload, nextExecuteAt),
              sendDisplayOperation: sdk ? (operation) => sdk.sendDisplayOperation(operation) : undefined,
            });

            if (import.meta.env.DEV && (action === 'showImage' || action === 'hideImage' || action === 'showText' || action === 'hideText')) {
              const nodeKey = typeof context?.nodeId === 'string' ? context.nodeId : 'display-object';
              const now = Date.now();
              const lastAt = displayObjectLogLastAt.get(nodeKey) ?? 0;
              if (now - lastAt >= 500) {
                displayObjectLogLastAt.set(nodeKey, now);
                const urlCandidate = (payload as Record<string, unknown>)?.url;
                const url = typeof urlCandidate === 'string' ? urlCandidate : '';
                const textCandidate = (payload as Record<string, unknown>)?.text;
                const text = typeof textCandidate === 'string' ? textCandidate : '';
                console.info('[Manager] display-object', {
                  nodeId: context?.nodeId,
                  via: sendResult.route,
                  targetDisplayId: selectedDisplayId || undefined,
                  action,
                  urlChars: url ? url.length : null,
                  textChars: text ? text.length : null,
                });
              }
            }
          }
        },
        onDisable: () => {
          // Clear any long-lived effects when the Display route is disabled (e.g. group gate closed / graph stop).
          displayTransport.sendControl('stopMedia', {}, undefined);
          displayTransport.sendControl('hideImage', {}, undefined);
          displayTransport.sendControl('hideText', {}, undefined);
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
    case 'client-permission-filter':
    case 'client-url-session-filter':
    case 'float':
    case 'int':
    case 'number-stabilizer':
    case 'math':
    case 'logic-add':
    case 'logic-multiple':
    case 'logic-subtract':
    case 'logic-divide':
    case 'logic-if':
    case 'logic-for':
    case 'logic-sleep':
    case 'boolean-to-pulse':
    case 'pulse-to-boolean':
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
