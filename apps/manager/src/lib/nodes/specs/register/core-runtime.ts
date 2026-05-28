/**
 * Purpose: Bridge manager-side JSON specs to node-core runtime implementations.
 */
import { get } from 'svelte/store';
import { NodeRegistry as CoreNodeRegistry, registerDefaultNodeDefinitions, type LatestSensorDataLike } from '@shugu/node-core';
import type { NodeDefinition } from '../../types';
import { getSDK, sensorData, state } from '$lib/stores/manager';
import { targetManagedClient } from './client-target';
import { createManagerImageAssetNodeDeps } from './image-asset-node-deps';

export type CoreRuntimeImpl = Pick<NodeDefinition, 'process' | 'onSink'>;

type PulseToBooleanState = {
  value: boolean;
  lastPulse: boolean;
};

type BooleanToPulseState = {
  initialized: boolean;
  lastValue: boolean;
  pulseUntil: number;
};

const pulseToBooleanState = new Map<string, PulseToBooleanState>();
const booleanToPulseState = new Map<string, BooleanToPulseState>();

const coerceBooleanInput = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  }
  return Boolean(value);
};

const pulseToBooleanFallback: CoreRuntimeImpl = {
  process: (inputs, config, context) => {
    const modeRaw = String(config.mode ?? 'toggle');
    const mode =
      modeRaw === 'latchTrue' || modeRaw === 'latchFalse' || modeRaw === 'momentary'
        ? modeRaw
        : 'toggle';
    const pulsed = coerceBooleanInput(inputs.pulse);
    if (mode === 'momentary') return { value: pulsed };

    const state = pulseToBooleanState.get(context.nodeId) ?? {
      value: coerceBooleanInput(config.defaultValue),
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
};

const booleanToPulseFallback: CoreRuntimeImpl = {
  process: (inputs, _config, context) => {
    const current = coerceBooleanInput(inputs.value);
    const state = booleanToPulseState.get(context.nodeId) ?? {
      initialized: false,
      lastValue: current,
      pulseUntil: 0,
    };

    if (!state.initialized) {
      state.initialized = true;
      state.lastValue = current;
      state.pulseUntil = 0;
    } else if (current !== state.lastValue) {
      state.lastValue = current;
      state.pulseUntil = context.time + Math.max(1, context.deltaTime);
    }

    const pulse = state.pulseUntil > 0 && context.time <= state.pulseUntil;
    if (!pulse) state.pulseUntil = 0;
    booleanToPulseState.set(context.nodeId, state);
    return { pulse };
  },
};

export const coreRuntimeImplByKind: Map<string, CoreRuntimeImpl> = (() => {
  const registry = new CoreNodeRegistry();

  registerDefaultNodeDefinitions(registry, {
    // Manager-side: resolve clientId from node config.
    getClientId: () => null,
    getSensorForClientId: (clientId) => {
      if (!clientId) return null;
      const data = get(sensorData).get(clientId);
      if (!data) return null;
      return {
        ...data,
        clientTimestamp: data.clientTimestamp ?? data.serverTimestamp,
      } satisfies LatestSensorDataLike;
    },
    getAllClientIds: () =>
      (get(state).clients ?? [])
        .filter((client) => client.group !== 'display' && client.connected !== false)
        .map((client) => String(client.clientId ?? ''))
        .filter(Boolean),
    getClientConnectionKey: (clientId) => {
      const client = (get(state).clients ?? []).find(
        (entry) => String(entry?.clientId ?? '') === String(clientId ?? '')
      );
      const connectedAt = client?.connectedAt;
      return typeof connectedAt === 'number' && Number.isFinite(connectedAt)
        ? String(connectedAt)
        : null;
    },
    getClientPermissions: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return client?.permissions ?? null;
    },
    getClientUrlSessionId: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return typeof client?.urlSessionId === 'string' ? client.urlSessionId : null;
    },
    isAudienceClient: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return client?.group !== 'display';
    },
    executeCommand: () => {
      // Manager always routes via executeCommandForClientId.
    },
    executeCommandForClientId: (clientId, cmd) => {
      const target = targetManagedClient(clientId);
      if (!target) return;
      const sdk = getSDK();
      if (!sdk) return;
      sdk.sendControl(target, cmd.action, cmd.payload ?? {}, cmd.executeAt);
    },
    audioAssets: {},
    imageAssets: createManagerImageAssetNodeDeps(),
  });

  const pick = (type: string): CoreRuntimeImpl => {
    const def = registry.get(type);
    if (!def && type === 'boolean-to-pulse') return booleanToPulseFallback;
    if (!def && type === 'pulse-to-boolean') return pulseToBooleanFallback;
    if (!def) {
      throw new Error(`[node-specs] missing core runtime impl: ${type}`);
    }
    return { process: def.process, onSink: def.onSink };
  };

  return new Map<string, CoreRuntimeImpl>([
    ['client-loader', pick('client-loader')],
    ['client-executor', pick('client-executor')],
    ['url-session', pick('url-session')],
    ['url-to-qr-generator', pick('url-to-qr-generator')],
    ['gpt-image-gen', pick('gpt-image-gen')],
    ['client-permission-filter', pick('client-permission-filter')],
    ['client-url-session-filter', pick('client-url-session-filter')],
    ['proc-client-sensors', pick('proc-client-sensors')],
    ['float', pick('float')],
    ['int', pick('int')],
    ['number-stabilizer', pick('number-stabilizer')],
    ['math', pick('math')],
    ['logic-add', pick('logic-add')],
    ['logic-multiple', pick('logic-multiple')],
    ['logic-subtract', pick('logic-subtract')],
    ['logic-divide', pick('logic-divide')],
    ['logic-if', pick('logic-if')],
    ['logic-for', pick('logic-for')],
    ['logic-sleep', pick('logic-sleep')],
    ['boolean-to-pulse', pick('boolean-to-pulse')],
    ['pulse-to-boolean', pick('pulse-to-boolean')],
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
    ['proc-play-video', pick('proc-play-video')],
    ['proc-visual-effects', pick('proc-visual-effects')],
  ]);
})();
