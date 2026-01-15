/**
 * Purpose: Processor node definitions that emit control commands.
 */
import type { NodeDefinition } from '../../types.js';
import type { NodeCommand } from '../types.js';
import { coerceBooleanOr } from '../utils.js';
import { getRecordString } from './node-definition-utils.js';

const FLASHLIGHT_MODE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
  { value: 'blink', label: 'Blink' },
] as const satisfies { value: string; label: string }[];

type PushImageUploadRuntimeState = {
  active: boolean;
  lastSentAt: number;
  seq: number;
};

const pushImageUploadRuntimeState = new Map<string, PushImageUploadRuntimeState>();

export function createPushImageUploadNode(): NodeDefinition {
  const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  return {
    type: 'proc-push-image-upload',
    label: 'Push Image Upload',
    category: 'Processors',
    inputs: [{ id: 'trigger', label: 'Push', type: 'boolean', defaultValue: false }],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        defaultValue: 'image/jpeg',
        options: [
          { value: 'image/jpeg', label: 'JPEG' },
          { value: 'image/png', label: 'PNG' },
          { value: 'image/webp', label: 'WebP' },
        ],
      },
      {
        key: 'quality',
        label: 'Quality',
        type: 'number',
        defaultValue: 0.85,
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      { key: 'maxWidth', label: 'Max Width', type: 'number', defaultValue: 960, min: 128, step: 1 },
      // Upload rate (best-effort): manager sends one capture request per interval while Push=true.
      {
        key: 'speed',
        label: 'Speed (fps)',
        type: 'number',
        defaultValue: 1,
        min: 0.1,
        max: 30,
        step: 0.1,
      },
    ],
    process: (inputs, config, context) => {
      const triggerActive = coerceBooleanOr(inputs.trigger, false);

      const state = pushImageUploadRuntimeState.get(context.nodeId) ?? {
        active: false,
        lastSentAt: 0,
        seq: 0,
      };

      if (!triggerActive) {
        state.active = false;
        state.lastSentAt = 0;
        pushImageUploadRuntimeState.set(context.nodeId, state);
        return {};
      }

      const formatRaw = typeof config.format === 'string' ? config.format.trim().toLowerCase() : '';
      const format =
        formatRaw === 'image/png' || formatRaw === 'image/webp' || formatRaw === 'image/jpeg'
          ? formatRaw
          : 'image/jpeg';

      const qualityRaw = Number(config.quality ?? 0.85);
      const quality = Number.isFinite(qualityRaw) ? clampNumber(qualityRaw, 0.1, 1) : 0.85;

      const maxWidthRaw = Number(config.maxWidth ?? 960);
      const maxWidth = Number.isFinite(maxWidthRaw) ? Math.max(128, Math.floor(maxWidthRaw)) : 960;

      const speedRaw = Number(config.speed ?? 1);
      const speed = Number.isFinite(speedRaw) ? clampNumber(speedRaw, 0.1, 30) : 1;
      const intervalMs = Math.max(1, Math.floor(1000 / speed));

      const now = context.time;
      const shouldSend =
        !state.active || state.lastSentAt === 0 || now - state.lastSentAt >= intervalMs;
      state.active = true;
      pushImageUploadRuntimeState.set(context.nodeId, state);
      if (!shouldSend) return {};

      state.lastSentAt = now;
      state.seq = (state.seq + 1) % 1_000_000_000;

      const cmd: NodeCommand = {
        action: 'custom',
        payload: {
          kind: 'push-image-upload',
          format,
          quality,
          maxWidth,
          speed,
          seq: state.seq,
        },
      };

      return { cmd };
    },
    onDisable: (_inputs, _config, context) => {
      pushImageUploadRuntimeState.delete(context.nodeId);
    },
  };
}

const showImageCommandCache = new Map<string, { signature: string; cmd: NodeCommand }>();

export function createShowImageProcessorNode(): NodeDefinition {
  const resolveUrl = (raw: unknown): string => {
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      // If upstream provides a queue/array, prefer the latest value (pipeline semantics).
      for (let i = raw.length - 1; i >= 0; i--) {
        const item = raw[i];
        if (typeof item === 'string' && item.trim()) return item.trim();
        const url = getRecordString(item, 'url');
        if (url) return url;
      }
      return '';
    }
    const url = getRecordString(raw, 'url');
    if (url) return url;
    return '';
  };

  return {
    type: 'proc-show-image',
    label: 'Dynamic Image Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'image' }],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const url = resolveUrl(inputs.in);
      const signature = url;

      const cached = showImageCommandCache.get(context.nodeId);
      if (cached && cached.signature === signature) return { cmd: cached.cmd };

      const cmd: NodeCommand = url
        ? {
            action: 'showImage',
            payload: { url },
          }
        : { action: 'hideImage', payload: {} };

      showImageCommandCache.set(context.nodeId, { signature, cmd });
      return { cmd };
    },
    onDisable: (_inputs, _config, context) => {
      showImageCommandCache.delete(context.nodeId);
    },
  };
}

export function createFlashlightProcessorNode(): NodeDefinition {
  return {
    type: 'proc-flashlight',
    label: 'Flashlight',
    category: 'Processors',
    inputs: [
      { id: 'active', label: 'Active', type: 'boolean' },
      { id: 'mode', label: 'Mode', type: 'string' },
      { id: 'frequencyHz', label: 'Freq', type: 'number' },
      { id: 'dutyCycle', label: 'Duty', type: 'number' },
    ],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [
      // `Active=false` sends a one-shot "off" command so effects can be disabled without stopping the graph.
      { key: 'active', label: 'Active', type: 'boolean', defaultValue: true },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'blink',
        options: FLASHLIGHT_MODE_OPTIONS as unknown as { value: string; label: string }[],
      },
      { key: 'frequencyHz', label: 'Frequency (Hz)', type: 'number', defaultValue: 2 },
      { key: 'dutyCycle', label: 'Duty Cycle', type: 'number', defaultValue: 0.5 },
    ],
    process: (inputs, config) => {
      const active = coerceBooleanOr(inputs.active ?? config.active, true);
      if (!active) {
        return { cmd: { action: 'flashlight', payload: { mode: 'off' } } };
      }

      const fallbackMode = String(config.mode ?? 'blink');
      const mode = (() => {
        const v = inputs.mode;
        if (typeof v === 'string' && v) {
          const options = FLASHLIGHT_MODE_OPTIONS.map((o) => o.value);
          return (options as string[]).includes(v) ? v : fallbackMode;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) return fallbackMode;
        const options = FLASHLIGHT_MODE_OPTIONS.map((o) => o.value);
        const clamped = Math.max(0, Math.min(1, v));
        const idx = Math.min(options.length - 1, Math.floor(clamped * options.length));
        return options[idx] ?? fallbackMode;
      })();

      if (mode === 'blink') {
        const freq =
          typeof inputs.frequencyHz === 'number'
            ? (inputs.frequencyHz as number)
            : Number(config.frequencyHz ?? 2);
        const duty =
          typeof inputs.dutyCycle === 'number'
            ? (inputs.dutyCycle as number)
            : Number(config.dutyCycle ?? 0.5);
        return {
          cmd: {
            action: 'flashlight',
            payload: { mode: 'blink', frequency: freq, dutyCycle: duty },
          },
        };
      }

      return { cmd: { action: 'flashlight', payload: { mode } } };
    },
  };
}

const SCREEN_WAVEFORM_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
] as const satisfies { value: string; label: string }[];

export function createScreenColorProcessorNode(): NodeDefinition {
  return {
    type: 'proc-screen-color',
    label: 'Screen Color',
    category: 'Processors',
    inputs: [
      { id: 'active', label: 'Active', type: 'boolean' },
      { id: 'primary', label: 'Primary', type: 'color' },
      { id: 'secondary', label: 'Secondary', type: 'color' },
      { id: 'waveform', label: 'Wave', type: 'string' },
      { id: 'frequencyHz', label: 'Freq', type: 'number' },
      { id: 'maxOpacity', label: 'Max', type: 'number' },
      { id: 'minOpacity', label: 'Min', type: 'number' },
    ],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [
      // `Active=false` sends a "solid transparent" payload to stop the animation loop and clear the overlay.
      { key: 'active', label: 'Active', type: 'boolean', defaultValue: true },
      { key: 'primary', label: 'Primary', type: 'string', defaultValue: '#6366f1' },
      { key: 'secondary', label: 'Secondary', type: 'string', defaultValue: '#ffffff' },
      { key: 'maxOpacity', label: 'Max Opacity', type: 'number', defaultValue: 1 },
      { key: 'minOpacity', label: 'Min Opacity', type: 'number', defaultValue: 0 },
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        defaultValue: 'sine',
        options: SCREEN_WAVEFORM_OPTIONS as unknown as { value: string; label: string }[],
      },
      { key: 'frequencyHz', label: 'Frequency (Hz)', type: 'number', defaultValue: 1.5 },
    ],
    process: (inputs, config) => {
      const active = coerceBooleanOr(inputs.active ?? config.active, true);
      if (!active) {
        return {
          cmd: {
            action: 'screenColor',
            payload: { color: 'transparent', opacity: 0, mode: 'solid' },
          },
        };
      }

      const primary =
        typeof inputs.primary === 'string' && inputs.primary
          ? String(inputs.primary)
          : String(config.primary ?? '#6366f1');
      const secondary =
        typeof inputs.secondary === 'string' && inputs.secondary
          ? String(inputs.secondary)
          : String(config.secondary ?? '#ffffff');
      const maxOpacity =
        typeof inputs.maxOpacity === 'number'
          ? (inputs.maxOpacity as number)
          : Number(config.maxOpacity ?? 1);
      const minOpacity =
        typeof inputs.minOpacity === 'number'
          ? (inputs.minOpacity as number)
          : Number(config.minOpacity ?? 0);
      const fallbackWaveform = String(config.waveform ?? 'sine');
      const waveform = (() => {
        const v = inputs.waveform;
        if (typeof v === 'string' && v) {
          const options = SCREEN_WAVEFORM_OPTIONS.map((o) => o.value);
          return (options as string[]).includes(v) ? v : fallbackWaveform;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) return fallbackWaveform;
        const options = SCREEN_WAVEFORM_OPTIONS.map((o) => o.value);
        const clamped = Math.max(0, Math.min(1, v));
        const idx = Math.min(options.length - 1, Math.floor(clamped * options.length));
        return options[idx] ?? fallbackWaveform;
      })();
      const frequencyHz =
        typeof inputs.frequencyHz === 'number'
          ? (inputs.frequencyHz as number)
          : Number(config.frequencyHz ?? 1.5);

      return {
        cmd: {
          action: 'screenColor',
          payload: {
            mode: 'modulate',
            color: primary,
            secondaryColor: secondary,
            opacity: maxOpacity,
            minOpacity,
            maxOpacity,
            frequencyHz,
            waveform,
          },
        },
      };
    },
  };
}

const SYNTH_WAVEFORM_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
] as const satisfies { value: string; label: string }[];

export function createSynthUpdateProcessorNode(): NodeDefinition {
  return {
    type: 'proc-synth-update',
    label: 'Synth (Update)',
    category: 'Processors',
    inputs: [
      { id: 'active', label: 'Active', type: 'boolean' },
      { id: 'waveform', label: 'Wave', type: 'string' },
      { id: 'frequency', label: 'Freq', type: 'number' },
      { id: 'volume', label: 'Vol', type: 'number' },
      { id: 'modDepth', label: 'Depth', type: 'number' },
      { id: 'modFrequency', label: 'Rate', type: 'number' },
      { id: 'durationMs', label: 'Dur', type: 'number' },
    ],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [
      // `Active=false` sends an update with `durationMs=0` so the client can stop the synth immediately.
      { key: 'active', label: 'Active', type: 'boolean', defaultValue: true },
      { key: 'frequency', label: 'Freq (Hz)', type: 'number', defaultValue: 180 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0.7 },
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        defaultValue: 'square',
        options: SYNTH_WAVEFORM_OPTIONS as unknown as { value: string; label: string }[],
      },
      { key: 'modDepth', label: 'Wobble Depth', type: 'number', defaultValue: 0 },
      { key: 'modFrequency', label: 'Wobble Rate (Hz)', type: 'number', defaultValue: 12 },
      { key: 'durationMs', label: 'Dur (ms)', type: 'number', defaultValue: 200 },
    ],
    process: (inputs, config) => {
      const active = coerceBooleanOr(inputs.active ?? config.active, true);
      if (!active) {
        return {
          cmd: {
            action: 'modulateSoundUpdate',
            payload: { durationMs: 0 },
          },
        };
      }

      const frequency =
        typeof inputs.frequency === 'number'
          ? (inputs.frequency as number)
          : Number(config.frequency ?? 180);
      const volume =
        typeof inputs.volume === 'number'
          ? (inputs.volume as number)
          : Number(config.volume ?? 0.7);
      const depthRaw =
        typeof inputs.modDepth === 'number'
          ? (inputs.modDepth as number)
          : Number(config.modDepth ?? 0);
      const depth = Math.max(0, Math.min(1, depthRaw));
      const modFrequency =
        typeof inputs.modFrequency === 'number'
          ? (inputs.modFrequency as number)
          : Number(config.modFrequency ?? 12);
      const durationMs =
        typeof inputs.durationMs === 'number'
          ? (inputs.durationMs as number)
          : Number(config.durationMs ?? 200);

      const fallbackWaveform = String(config.waveform ?? 'square');
      const waveform = (() => {
        const v = inputs.waveform;
        if (typeof v === 'string' && v) {
          const options = SYNTH_WAVEFORM_OPTIONS.map((o) => o.value);
          return (options as string[]).includes(v) ? v : fallbackWaveform;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) return fallbackWaveform;
        const options = SYNTH_WAVEFORM_OPTIONS.map((o) => o.value);
        const clamped = Math.max(0, Math.min(1, v));
        const idx = Math.min(options.length - 1, Math.floor(clamped * options.length));
        return options[idx] ?? fallbackWaveform;
      })();

      return {
        cmd: {
          action: 'modulateSoundUpdate',
          payload: {
            frequency,
            volume: Math.max(0, Math.min(1, volume)),
            waveform,
            modDepth: depth > 0 ? depth : undefined,
            modFrequency: depth > 0 ? modFrequency : undefined,
            durationMs,
          },
        },
      };
    },
  };
}
