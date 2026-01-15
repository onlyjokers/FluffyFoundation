/**
 * Purpose: Player/output nodes and command helpers.
 */
import type {
  ConvolutionPreset,
  VisualEffect,
  VisualEffectsPayload,
  VisualSceneLayerItem,
  VisualScenesPayload,
} from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import type { ClientObjectDeps, NodeCommand } from '../types.js';
import { clampInt, clampNumber, coerceBooleanOr, coerceNumber } from '../utils.js';
import {
  asRecord,
  getArrayValue,
  getRecordString,
  getStringValue,
} from './node-definition-utils.js';

const coerceConvolutionPreset = (value: unknown): ConvolutionPreset | undefined => {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const allowed: readonly ConvolutionPreset[] = [
    'blur',
    'gaussianBlur',
    'sharpen',
    'edge',
    'emboss',
    'sobelX',
    'sobelY',
    'custom',
  ];
  return allowed.includes(raw as ConvolutionPreset) ? (raw as ConvolutionPreset) : undefined;
};

export function createAudioOutNode(): NodeDefinition {
  return {
    type: 'audio-out',
    label: 'Static Audio Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'audio', kind: 'sink' }],
    outputs: [
      // Manager-only routing: connect to `client-object(in)` to indicate patch target(s).
      // This output is not part of the exported client patch subgraph.
      { id: 'cmd', label: 'Deploy', type: 'command' },
    ],
    configSchema: [],
    process: () => ({}),
  };
}

export function createImageOutNode(deps: ClientObjectDeps): NodeDefinition {
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

  const hide = () => {
    deps.executeCommand({ action: 'hideImage', payload: {} });
  };

  return {
    type: 'image-out',
    label: 'Static Image Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'image', kind: 'sink' }],
    outputs: [
      // Manager-only routing: connect to `client-object(in)` to indicate patch target(s).
      // This output is not part of the exported client patch subgraph.
      { id: 'cmd', label: 'Deploy', type: 'command' },
    ],
    configSchema: [],
    process: () => ({}),
    onSink: (inputs) => {
      const url = resolveUrl(inputs.in);
      if (!url) {
        hide();
        return;
      }
      deps.executeCommand({ action: 'showImage', payload: { url } });
    },
    onDisable: () => {
      hide();
    },
  };
}

export function createVideoOutNode(deps: ClientObjectDeps): NodeDefinition {
  const resolveUrl = (raw: unknown): string => {
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      for (const item of raw) {
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

  const parseMutedFromUrl = (url: string): boolean | null => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    const index = trimmed.indexOf('#');
    const paramsRaw = index >= 0 ? trimmed.slice(index + 1) : '';
    if (!paramsRaw) return null;

    const params = new URLSearchParams(paramsRaw);
    const value = params.get('muted');
    if (value === null) return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const n = Number(normalized);
    if (Number.isFinite(n)) return n >= 0.5;
    return null;
  };

  const parseVolumeFromUrl = (url: string): number | null => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    const index = trimmed.indexOf('#');
    const paramsRaw = index >= 0 ? trimmed.slice(index + 1) : '';
    if (!paramsRaw) return null;

    const params = new URLSearchParams(paramsRaw);
    const value = params.get('vol') ?? params.get('volume');
    if (value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  };

  const stop = () => {
    deps.executeCommand({ action: 'stopMedia', payload: {} });
  };

  return {
    type: 'video-out',
    label: 'Static Video Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'video', kind: 'sink' }],
    outputs: [
      // Manager-only routing: connect to `client-object(in)` to indicate patch target(s).
      // This output is not part of the exported client patch subgraph.
      { id: 'cmd', label: 'Deploy', type: 'command' },
    ],
    configSchema: [],
    process: () => ({}),
    onSink: (inputs) => {
      const url = resolveUrl(inputs.in);
      if (!url) {
        stop();
        return;
      }
      const muted = parseMutedFromUrl(url);
      const volume = parseVolumeFromUrl(url);
      deps.executeCommand({
        action: 'playMedia',
        payload: {
          url,
          mediaType: 'video',
          ...(volume === null ? {} : { volume }),
          ...(muted === null ? {} : { muted }),
        },
      });
    },
    onDisable: () => {
      stop();
    },
  };
}

export function createEffectOutNode(deps: ClientObjectDeps): NodeDefinition {
  const clear = () => {
    const payload: VisualEffectsPayload = { effects: [] };
    deps.executeCommand({ action: 'visualEffects', payload });
  };

  const coerceEffectChain = (raw: unknown): VisualEffect[] => {
    if (!Array.isArray(raw)) return [];
    const effects: VisualEffect[] = [];

    for (const item of raw) {
      const record = asRecord(item);
      if (!record) continue;
      const type = getStringValue(record.type) ?? '';
      if (type === 'ascii') {
        const cellSize = clampInt(record.cellSize, 11, 1, 100);
        effects.push({ type: 'ascii', cellSize });
        continue;
      }
      if (type === 'convolution') {
        const preset = coerceConvolutionPreset(record.preset);
        const kernelRaw = getArrayValue(record.kernel);
        const kernel = kernelRaw
          ? kernelRaw
              .map((n: unknown) => (typeof n === 'number' ? n : Number(n)))
              .filter((n: number) => Number.isFinite(n))
              .slice(0, 9)
          : undefined;
        const mix = clampNumber(coerceNumber(record.mix, 1), 0, 1);
        const bias = clampNumber(coerceNumber(record.bias, 0), -1, 1);
        const normalize = coerceBooleanOr(record.normalize, true);
        const scale = clampNumber(coerceNumber(record.scale, 0.5), 0.1, 1);

        effects.push({
          type: 'convolution',
          ...(preset ? { preset } : {}),
          ...(kernel && kernel.length === 9 ? { kernel } : {}),
          mix,
          bias,
          normalize,
          scale,
        });
      }
    }

    return effects;
  };

  return {
    type: 'effect-out',
    label: 'Effect Layer Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'effect', kind: 'sink' }],
    outputs: [
      // Manager-only routing: connect to `client-object(in)` to indicate patch target(s).
      // This output is not part of the exported client patch subgraph.
      { id: 'cmd', label: 'Deploy', type: 'command' },
    ],
    configSchema: [],
    process: () => ({}),
    onSink: (inputs) => {
      const effects = coerceEffectChain(inputs.in);
      const payload: VisualEffectsPayload = { effects };
      deps.executeCommand({ action: 'visualEffects', payload });
    },
    onDisable: () => {
      clear();
    },
  };
}

export function createSceneOutNode(deps: ClientObjectDeps): NodeDefinition {
  const clear = () => {
    const payload: VisualScenesPayload = { scenes: [] };
    deps.executeCommand({ action: 'visualScenes', payload });
  };

  const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] => {
    if (!Array.isArray(raw)) return [];
    const scenes: VisualSceneLayerItem[] = [];

    for (const item of raw.slice(0, 12)) {
      const record = asRecord(item);
      if (!record) continue;
      const type = getStringValue(record.type) ?? '';

      if (type === 'box') {
        scenes.push({ type: 'box' });
        continue;
      }
      if (type === 'mel') {
        scenes.push({ type: 'mel' });
        continue;
      }
      if (type === 'frontCamera') {
        scenes.push({ type: 'frontCamera' });
        continue;
      }
      if (type === 'backCamera') {
        scenes.push({ type: 'backCamera' });
      }
    }

    return scenes;
  };

  return {
    type: 'scene-out',
    label: 'Scene Layer Player',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'scene', kind: 'sink' }],
    outputs: [
      // Manager-only routing: connect to `client-object(in)` to indicate patch target(s).
      // This output is not part of the exported client patch subgraph.
      { id: 'cmd', label: 'Deploy', type: 'command' },
    ],
    configSchema: [],
    process: () => ({}),
    onSink: (inputs) => {
      const scenes = coerceSceneChain(inputs.in);
      const payload: VisualScenesPayload = { scenes };
      deps.executeCommand({ action: 'visualScenes', payload });
    },
    onDisable: () => {
      clear();
    },
  };
}

const playMediaTriggerState = new Map<string, boolean>();
const playMediaCommandCache = new Map<string, { signature: string; cmd: NodeCommand | null }>();

export function createPlayMediaNode(): NodeDefinition {
  const resolveUrl = (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    key: string
  ): string => {
    const fromInput = inputs[key];
    if (typeof fromInput === 'string' && fromInput.trim()) return fromInput.trim();
    const fromConfig = config[key];
    if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim();
    return '';
  };

  return {
    type: 'play-media',
    label: 'Play Media',
    category: 'Audio',
    inputs: [
      { id: 'audioUrl', label: 'Audio', type: 'string' },
      { id: 'imageUrl', label: 'Image', type: 'string' },
      { id: 'videoUrl', label: 'Video', type: 'string' },
      { id: 'trigger', label: 'Trigger', type: 'number' },
      {
        id: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'fadeIn', label: 'Fade In (ms)', type: 'number', defaultValue: 0, min: 0, step: 10 },
      { id: 'muted', label: 'Video Muted', type: 'boolean', defaultValue: true },
      {
        id: 'imageDuration',
        label: 'Image Duration (ms)',
        type: 'number',
        defaultValue: 0,
        min: 0,
        step: 100,
      },
    ],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [
      { key: 'audioUrl', label: 'Audio URL', type: 'string', defaultValue: '' },
      { key: 'imageUrl', label: 'Image URL', type: 'string', defaultValue: '' },
      { key: 'videoUrl', label: 'Video URL', type: 'string', defaultValue: '' },
      {
        key: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
      { key: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { key: 'fadeIn', label: 'Fade In (ms)', type: 'number', defaultValue: 0, min: 0, step: 10 },
      { key: 'muted', label: 'Video Muted', type: 'boolean', defaultValue: true },
      {
        key: 'imageDuration',
        label: 'Image Duration (ms)',
        type: 'number',
        defaultValue: 0,
        min: 0,
        step: 100,
      },
    ],
    process: (inputs, config, context) => {
      const triggerRaw = inputs.trigger;
      const hasTrigger = triggerRaw !== undefined && triggerRaw !== null;
      const triggerActive =
        typeof triggerRaw === 'number' ? triggerRaw >= 0.5 : Boolean(triggerRaw);

      if (hasTrigger) {
        const prev = playMediaTriggerState.get(context.nodeId) ?? false;
        playMediaTriggerState.set(context.nodeId, triggerActive);
        if (!triggerActive || prev) return {};
      }
      const forceSend = hasTrigger;

      const imageUrl = resolveUrl(inputs, config, 'imageUrl');
      const videoUrl = resolveUrl(inputs, config, 'videoUrl');
      const audioUrl = resolveUrl(inputs, config, 'audioUrl');

      const volumeRaw =
        typeof inputs.volume === 'number' ? inputs.volume : Number(config.volume ?? 1);
      const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : 1;
      const loop = typeof inputs.loop === 'boolean' ? inputs.loop : Boolean(config.loop ?? false);
      const fadeInRaw =
        typeof inputs.fadeIn === 'number' ? inputs.fadeIn : Number(config.fadeIn ?? 0);
      const fadeIn = Number.isFinite(fadeInRaw) ? Math.max(0, fadeInRaw) : 0;
      const muted =
        typeof inputs.muted === 'boolean' ? inputs.muted : Boolean(config.muted ?? true);
      const imageDurationRaw =
        typeof inputs.imageDuration === 'number'
          ? inputs.imageDuration
          : Number(config.imageDuration ?? 0);
      const imageDuration =
        Number.isFinite(imageDurationRaw) && imageDurationRaw > 0 ? imageDurationRaw : undefined;

      let cmd: NodeCommand | null = null;

      if (imageUrl) {
        cmd = {
          action: 'showImage',
          payload: {
            url: imageUrl,
            duration: imageDuration,
          },
        };
      } else if (videoUrl) {
        cmd = {
          action: 'playMedia',
          payload: {
            url: videoUrl,
            mediaType: 'video',
            volume,
            loop,
            fadeIn,
            muted,
          },
        };
      } else if (audioUrl) {
        cmd = {
          action: 'playMedia',
          payload: {
            url: audioUrl,
            mediaType: 'audio',
            volume,
            loop,
            fadeIn,
          },
        };
      }

      if (!cmd) {
        playMediaCommandCache.set(context.nodeId, { signature: '', cmd: null });
        return { cmd: null };
      }

      const signature = (() => {
        try {
          return JSON.stringify(cmd);
        } catch {
          return String(cmd.action ?? '');
        }
      })();

      if (forceSend) {
        playMediaCommandCache.set(context.nodeId, { signature, cmd });
        return { cmd };
      }

      const cached = playMediaCommandCache.get(context.nodeId);
      if (!cached || cached.signature !== signature) {
        playMediaCommandCache.set(context.nodeId, { signature, cmd });
        return { cmd };
      }

      // Reuse the cached command object to avoid deepEqual JSON stringify on large payloads.
      return { cmd: cached.cmd };
    },
  };
}
