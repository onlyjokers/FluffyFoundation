/**
 * Purpose: Register Tone adapter node definitions into a NodeRegistry.
 */

import type {
  ConfigField,
  Connection,
  NodeInstance,
  NodePort,
  NodeRegistry,
  ProcessContext,
} from '@shugu/node-core';
import { consumeNodeMediaFinishPulse, toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps, ToneAdapterHandle, ToneEffectKind } from './types.js';
import {
  DEFAULT_RAMP_SECONDS,
  MIN_TONE_DELAY_TIME_SECONDS,
  audioDataInstances,
  effectInstances,
  ensureTone,
  granularInstances,
  latestAudioConnections,
  latestGraphNodesById,
  latestToneLfoActiveTargets,
  latestToneLfoConnections,
  latestToneLfoDesiredTargets,
  lfoInstances,
  oscInstances,
  playerInstances,
  setLatestDeps,
  toneModule,
} from './state.js';
import { maybeStopTransport, scheduleGraphWiring, updateAudioGraphSnapshot } from './engine-host.js';
import {
  analyzeAudioDataInstance,
  createAudioDataInstance,
  createEffectInstance,
  createGranularInstance,
  createOscInstance,
  createPlayerInstance,
  createToneLfoInstance,
  disposeAudioDataInstance,
  disposeEffectInstance,
  disposeGranularInstance,
  disposeLoop,
  disposeNodeById,
  disposeOscInstance,
  disposePlayerInstance,
  disposeToneLfoInstance,
  normalizeAudioDataConfig,
  parseLoopPattern,
  requestTonePlayerLoad,
  updateAudioDataInstance,
  updateEffectInstance,
  updateLoop,
  updateToneLfoInstance,
} from './nodes.js';
import {
  clamp,
  loopKeyOf,
  normalizeLocalMediaRef,
  toAssetVolumeGain,
  toBoolean,
  toNonNegativeNumber,
  toNumber,
  toString,
} from './utils.js';

type VideoFinishState = {
  signature: string;
  lastPlay: boolean;
  finished: boolean;
  updatedAt: number;
};

const videoFinishStates = new Map<string, VideoFinishState>();
const VIDEO_FINISH_MAX_AGE_MS = 10 * 60 * 1000;

const ASSET_REF_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function pruneVideoFinishStates(now: number): void {
  for (const [nodeId, entry] of videoFinishStates.entries()) {
    if (now - entry.updatedAt > VIDEO_FINISH_MAX_AGE_MS) videoFinishStates.delete(nodeId);
  }
}

function videoFinishSignatureFromRef(ref: unknown): string {
  if (typeof ref !== 'string') return '';
  const trimmed = ref.trim();
  if (!trimmed) return '';

  const hashIndex = trimmed.indexOf('#');
  const baseUrl = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const paramsRaw = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  if (!paramsRaw) return baseUrl;

  try {
    const params = new URLSearchParams(paramsRaw);
    const t = params.get('t') ?? '';
    const p = params.get('p') ?? '';
    const loop = params.get('loop') ?? '';
    const rev = params.get('rev') ?? '';
    return `${baseUrl}#t=${t}&p=${p}&loop=${loop}&rev=${rev}`;
  } catch {
    return baseUrl;
  }
}

function normalizeRemoteAssetRef(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

  const queryIndex = withoutHash.indexOf('?');
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const baseRef = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const baseTrimmed = baseRef.trim();
  if (!baseTrimmed) return '';

  if (baseTrimmed.startsWith('asset:')) {
    const id = baseTrimmed.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}${search}${hash}` : '';
  }

  const shuguPrefix = 'shugu://asset/';
  if (baseTrimmed.startsWith(shuguPrefix)) {
    const id = baseTrimmed.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}${search}${hash}` : '';
  }

  // Reject non-asset schemes (http(s), localfile, data, etc.).
  if (ASSET_REF_SCHEME_RE.test(baseTrimmed)) return '';

  // Treat bare values as asset IDs.
  const id = baseTrimmed.split(/[?#]/)[0]?.trim() ?? '';
  return id ? `asset:${id}${search}${hash}` : '';
}
export function registerToneClientDefinitions(
  registry: NodeRegistry,
  deps: ToneAdapterDeps = {}
): ToneAdapterHandle {
  // Store deps for standalone functions (e.g., startTonePlayerLoad).
  setLatestDeps(deps);

  registry.register({
    type: 'tone-osc',
    label: 'Tone Osc (client)',
    category: 'Audio',
    inputs: [
      { id: 'frequency', label: 'Freq', type: 'number', defaultValue: 440 },
      { id: 'amplitude', label: 'Amp', type: 'number', defaultValue: 1 },
      { id: 'waveform', label: 'Waveform', type: 'string' },
      { id: 'loop', label: 'Loop (pattern)', type: 'string' },
    ],
    outputs: [{ id: 'value', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        defaultValue: 'sine',
        options: [
          { value: 'sine', label: 'Sine' },
          { value: 'square', label: 'Square' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'sawtooth', label: 'Sawtooth' },
        ],
      },
      { key: 'loop', label: 'Loop (pattern)', type: 'string', defaultValue: '' },
    ],
    process: (inputs, config, context: ProcessContext) => {
      const frequency = toNumber(inputs.frequency ?? config.frequency, 440);
      const amplitude = toNumber(inputs.amplitude ?? config.amplitude, 1);
      const waveform = (() => {
        const v = inputs.waveform;
        if (typeof v === 'string' && v.trim()) return v.trim();
        return toString(config.waveform, 'sine');
      })();
      const loopPattern = (() => {
        const v = inputs.loop;
        if (typeof v === 'string' && v.trim()) return v.trim();
        return toString(config.loop, '');
      })();
      const loopKey = loopKeyOf(loopPattern);

      const hasAudioConnections = latestAudioConnections.some(
        (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
      );
      if (!hasAudioConnections) {
        if (oscInstances.has(context.nodeId)) disposeOscInstance(context.nodeId);
        return { value: amplitude };
      }

      if (!toneAudioEngine.isEnabled()) {
        return { value: amplitude };
      }

      if (!toneModule) {
        void ensureTone().catch((error) =>
          console.warn('[tone-adapter] Tone.js load failed', error)
        );
        return { value: amplitude };
      }

      let instance = oscInstances.get(context.nodeId);
      if (!instance) {
        instance = createOscInstance(context.nodeId, frequency, amplitude, waveform);
      }

      if (instance.lastWaveform !== waveform) {
        try {
          instance.osc.type = waveform;
          instance.lastWaveform = waveform;
        } catch {
          // ignore invalid waveform values
        }
      }

      if (instance.lastFrequency === null || Math.abs(instance.lastFrequency - frequency) > 0.001) {
        instance.osc.frequency.rampTo(frequency, DEFAULT_RAMP_SECONDS);
        instance.lastFrequency = frequency;
      }

      if (instance.lastAmplitude === null || Math.abs(instance.lastAmplitude - amplitude) > 0.001) {
        instance.gain.gain.rampTo(amplitude, DEFAULT_RAMP_SECONDS);
        instance.lastAmplitude = amplitude;
      }

      if (loopKey) {
        const defaultsChanged =
          !instance.loopDefaults ||
          Math.abs(instance.loopDefaults.frequency - frequency) > 0.001 ||
          Math.abs(instance.loopDefaults.amplitude - amplitude) > 0.001;

        if (loopKey !== instance.loopKey || defaultsChanged) {
          const parsed = parseLoopPattern(loopPattern, { frequency, amplitude });
          if (parsed) {
            updateLoop(instance, parsed, deps, toNumber(config.loopStartAt, NaN));
            instance.loopKey = loopKey;
            instance.loopDefaults = { frequency, amplitude };
          }
        }
      } else if (instance.loop) {
        disposeLoop(instance);
        instance.loopDefaults = null;
        maybeStopTransport();
      }

      return { value: amplitude };
    },
  });

  registry.register({
    type: 'tone-lfo',
    label: 'Tone LFO (client)',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'number', defaultValue: 1 },
      { id: 'frequencyHz', label: 'Freq (Hz)', type: 'number', defaultValue: 1 },
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 1 },
      { id: 'amplitude', label: 'Depth', type: 'number', defaultValue: 1 },
      { id: 'waveform', label: 'Waveform', type: 'string' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [
      {
        key: 'frequencyHz',
        label: 'Freq (Hz)',
        type: 'number',
        defaultValue: 1,
        min: 0,
        step: 0.01,
      },
      { key: 'min', label: 'Min', type: 'number', defaultValue: 0, step: 0.01 },
      { key: 'max', label: 'Max', type: 'number', defaultValue: 1, step: 0.01 },
      {
        key: 'amplitude',
        label: 'Depth',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'waveform',
        label: 'Waveform',
        type: 'select',
        defaultValue: 'sine',
        options: [
          { value: 'sine', label: 'Sine' },
          { value: 'square', label: 'Square' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'sawtooth', label: 'Sawtooth' },
        ],
      },
    ],
    process: (inputs, config, context) => {
      const scale = toNumber(inputs.in, 1);
      const frequencyHz = Math.max(0, toNumber(inputs.frequencyHz ?? config.frequencyHz, 1));
      const min = toNumber(inputs.min ?? config.min, 0);
      const max = toNumber(inputs.max ?? config.max, 1);
      const depth = clamp(toNumber(inputs.amplitude ?? config.amplitude, 1), 0, 1);
      const waveform = (() => {
        const v = inputs.waveform;
        if (typeof v === 'string' && v.trim()) return v.trim();
        return toString(config.waveform, 'sine');
      })();

      const scaledMin = min * scale;
      const scaledMax = max * scale;

      const phase = (context.time / 1000) * frequencyHz * 2 * Math.PI;

      let normalized: number;
      switch (waveform) {
        case 'sine':
          normalized = (Math.sin(phase) + 1) / 2;
          break;
        case 'square':
          normalized = Math.sin(phase) >= 0 ? 1 : 0;
          break;
        case 'triangle':
          normalized = Math.abs((((context.time / 1000) * frequencyHz * 2) % 2) - 1);
          break;
        case 'sawtooth':
          normalized = ((context.time / 1000) * frequencyHz) % 1;
          break;
        default:
          normalized = (Math.sin(phase) + 1) / 2;
      }

      const centered = 0.5 + (normalized - 0.5) * depth;
      const value = scaledMin + centered * (scaledMax - scaledMin);

      if (!toneAudioEngine.isEnabled()) {
        return { value };
      }

      if (!toneModule) {
        void ensureTone().catch((error) =>
          console.warn('[tone-adapter] Tone.js load failed', error)
        );
        return { value };
      }

      const hasTargets = latestToneLfoConnections.some(
        (conn) => conn.sourceNodeId === context.nodeId
      );
      if (!hasTargets) {
        if (lfoInstances.has(context.nodeId)) disposeToneLfoInstance(context.nodeId);
        return { value };
      }

      const params = {
        frequencyHz,
        min: scaledMin,
        max: scaledMax,
        amplitude: depth,
        waveform,
      };
      const instance = lfoInstances.get(context.nodeId);
      if (!instance) {
        createToneLfoInstance(context.nodeId, {
          frequencyHz,
          min: scaledMin,
          max: scaledMax,
          amplitude: depth,
          waveform,
        });
      } else {
        updateToneLfoInstance(instance, params);
      }

      return { value };
    },
  });

  registry.register({
    type: 'audio-data',
    label: 'Audio Data (client)',
    category: 'Audio',
    inputs: [{ id: 'in', label: 'In', type: 'audio', kind: 'sink' }],
    outputs: [
      { id: 'out', label: 'Out', type: 'audio', kind: 'sink' },
      { id: 'rms', label: 'RMS', type: 'number' },
      { id: 'peak', label: 'Peak', type: 'number' },
      { id: 'low', label: 'Low', type: 'number' },
      { id: 'mid', label: 'Mid', type: 'number' },
      { id: 'high', label: 'High', type: 'number' },
      { id: 'centroidHz', label: 'Centroid (Hz)', type: 'number' },
      { id: 'bpm', label: 'BPM', type: 'number' },
      { id: 'beat', label: 'Beat', type: 'boolean' },
    ],
    configSchema: [
      { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true },
      {
        key: 'fftSize',
        label: 'FFT Size',
        type: 'select',
        defaultValue: '2048',
        options: [
          { value: '512', label: '512' },
          { value: '1024', label: '1024' },
          { value: '2048', label: '2048' },
          { value: '4096', label: '4096' },
          { value: '8192', label: '8192' },
        ],
      },
      {
        key: 'smoothing',
        label: 'Smoothing',
        type: 'number',
        defaultValue: 0.2,
        min: 0,
        max: 0.99,
        step: 0.01,
      },
      {
        key: 'lowCutoffHz',
        label: 'Low Cutoff (Hz)',
        type: 'number',
        defaultValue: 300,
        min: 20,
        max: 20000,
        step: 10,
      },
      {
        key: 'highCutoffHz',
        label: 'High Cutoff (Hz)',
        type: 'number',
        defaultValue: 3000,
        min: 20,
        max: 20000,
        step: 10,
      },
      { key: 'detectBPM', label: 'Detect BPM', type: 'boolean', defaultValue: true },
    ],
    process: (_inputs, config, context) => {
      const empty = {
        out: 0,
        rms: 0,
        peak: 0,
        low: 0,
        mid: 0,
        high: 0,
        centroidHz: 0,
        bpm: 0,
        beat: false,
      };

      if (!toneAudioEngine.isEnabled()) {
        if (audioDataInstances.has(context.nodeId)) disposeAudioDataInstance(context.nodeId);
        return empty;
      }

      if (!toneModule) {
        void ensureTone().catch((error) => console.warn('[tone-adapter] Tone.js load failed', error));
        return empty;
      }

      const hasAudioConnections = latestAudioConnections.some(
        (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
      );
      if (!hasAudioConnections) {
        if (audioDataInstances.has(context.nodeId)) disposeAudioDataInstance(context.nodeId);
        return empty;
      }

      const nextConfig = normalizeAudioDataConfig(config as Record<string, unknown>);
      let instance = audioDataInstances.get(context.nodeId) ?? null;
      if (!instance) {
        instance = createAudioDataInstance(context.nodeId, nextConfig);
      } else {
        updateAudioDataInstance(instance, nextConfig);
      }

      if (!instance || !nextConfig.enabled) return empty;

      const analyzed = analyzeAudioDataInstance(instance, context.time);
      return { ...empty, ...analyzed };
    },
  });

  const effectProcess = (
    kind: ToneEffectKind,
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ProcessContext,
    defaults: Record<string, number>
  ): Record<string, unknown> => {
    const inputValue = toNumber(inputs.in, 0);

    const params: Record<string, number> = { ...defaults };
    Object.keys(defaults).forEach((key) => {
      const fromInput = inputs[key];
      const fromConfig = config[key];
      params[key] = toNumber(fromInput ?? fromConfig, defaults[key]);
    });

    if (!toneAudioEngine.isEnabled()) return { out: inputValue };

    if (!toneModule) {
      void ensureTone().catch((error) => console.warn('[tone-adapter] Tone.js load failed', error));
      return { out: inputValue };
    }

    const hasAudioConnections = latestAudioConnections.some(
      (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
    );
    if (!hasAudioConnections) {
      if (effectInstances.has(context.nodeId)) disposeEffectInstance(context.nodeId);
      return { out: inputValue };
    }

    let instance = effectInstances.get(context.nodeId);
    if (!instance) {
      instance = createEffectInstance(kind, params, context.nodeId);
    } else {
      updateEffectInstance(instance, params);
    }

    return { out: inputValue };
  };

  registry.register({
    type: 'tone-delay',
    label: 'Tone Delay (client)',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: MIN_TONE_DELAY_TIME_SECONDS },
      { id: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 1 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: MIN_TONE_DELAY_TIME_SECONDS },
      { key: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 1 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    process: (inputs, config, context) =>
      effectProcess('tone-delay', inputs, config, context, {
        time: 0.25,
        feedback: 0.35,
        wet: 0.3,
      }),
  });

  registry.register({
    type: 'tone-resonator',
    label: 'Tone Resonator (client)',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'resonance', label: 'Resonance', type: 'number', defaultValue: 0.6 },
      { id: 'dampening', label: 'Dampening', type: 'number', defaultValue: 3000 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'resonance', label: 'Resonance', type: 'number', defaultValue: 0.6 },
      { key: 'dampening', label: 'Dampening (Hz)', type: 'number', defaultValue: 3000 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4 },
    ],
    process: (inputs, config, context) =>
      effectProcess('tone-resonator', inputs, config, context, {
        resonance: 0.6,
        dampening: 3000,
        wet: 0.4,
      }),
  });

  registry.register({
    type: 'tone-pitch',
    label: 'Tone Pitch (client)',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'pitch', label: 'Pitch (st)', type: 'number', defaultValue: 0 },
      { id: 'windowSize', label: 'Window', type: 'number', defaultValue: 0.1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'pitch', label: 'Pitch (st)', type: 'number', defaultValue: 0 },
      { key: 'windowSize', label: 'Window', type: 'number', defaultValue: 0.1 },
    ],
    process: (inputs, config, context) =>
      effectProcess('tone-pitch', inputs, config, context, {
        pitch: 0,
        windowSize: 0.1,
      }),
  });

  registry.register({
    type: 'tone-reverb',
    label: 'Tone Reverb (client)',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3 },
    ],
    process: (inputs, config, context) =>
      effectProcess('tone-reverb', inputs, config, context, {
        decay: 1.6,
        wet: 0.3,
      }),
  });

  registry.register({
    type: 'tone-granular',
    label: 'Tone Granular (client)',
    category: 'Audio',
    inputs: [
      { id: 'url', label: 'Asset', type: 'asset' },
      { id: 'gate', label: 'Gate', type: 'number', defaultValue: 0 },
      { id: 'loop', label: 'Loop', type: 'boolean' },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'grainSize', label: 'Grain (s)', type: 'number', defaultValue: 0.2 },
      { id: 'overlap', label: 'Overlap (s)', type: 'number', defaultValue: 0.1 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0.6 },
    ],
    outputs: [{ id: 'value', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'url', label: 'Audio Asset', type: 'asset-picker', assetKind: 'audio', defaultValue: '' },
      { key: 'loop', label: 'Loop', type: 'boolean', defaultValue: true },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { key: 'grainSize', label: 'Grain (s)', type: 'number', defaultValue: 0.2 },
      { key: 'overlap', label: 'Overlap (s)', type: 'number', defaultValue: 0.1 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0.6 },
    ],
    process: (inputs, config, context) => {
      const playbackRate = toNumber(inputs.playbackRate ?? config.playbackRate, 1);
      const detune = toNumber(inputs.detune ?? config.detune, 0);
      const grainSize = toNumber(inputs.grainSize ?? config.grainSize, 0.2);
      const overlap = toNumber(inputs.overlap ?? config.overlap, 0.1);
      const volume = toNumber(inputs.volume ?? config.volume, 0.6);
      const urlRaw = toString(inputs.url ?? config.url, '');
      const assetRef = normalizeRemoteAssetRef(urlRaw);
      const url = assetRef && deps.resolveAssetRef ? deps.resolveAssetRef(assetRef) : '';
      const loop =
        inputs.loop !== undefined && inputs.loop !== null
          ? toBoolean(inputs.loop, true)
          : toBoolean(config.loop, true);
      const gate = toNumber(inputs.gate, 0);
      const playing = gate > 0;

      if (!toneAudioEngine.isEnabled()) {
        return { value: volume };
      }

      if (!toneModule) {
        void ensureTone().catch((error) =>
          console.warn('[tone-adapter] Tone.js load failed', error)
        );
        return { value: volume };
      }

      const hasAudioConnections = latestAudioConnections.some(
        (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
      );
      if (!hasAudioConnections) {
        if (granularInstances.has(context.nodeId)) disposeGranularInstance(context.nodeId);
        return { value: volume };
      }

      if (!url) {
        if (granularInstances.has(context.nodeId)) disposeGranularInstance(context.nodeId);
        return { value: volume };
      }

      let instance = granularInstances.get(context.nodeId);
      const params = {
        playbackRate,
        detune,
        grainSize,
        overlap,
        volume,
        loop,
        playing,
      };

      const shouldCreate = playing;
      if (!instance) {
        if (!shouldCreate) return { value: volume };
        instance = createGranularInstance(context.nodeId, url, params);
      }

      if (instance.lastUrl !== url && url) {
        disposeGranularInstance(context.nodeId);
        instance = createGranularInstance(context.nodeId, url, params);
      }

      if (instance.lastParams.playbackRate !== playbackRate)
        instance.player.playbackRate = playbackRate;
      if (instance.lastParams.detune !== detune) instance.player.detune = detune;
      if (instance.lastParams.grainSize !== grainSize) instance.player.grainSize = grainSize;
      if (instance.lastParams.overlap !== overlap) instance.player.overlap = overlap;
      if (instance.lastParams.loop !== loop) instance.player.loop = loop;
      if (instance.lastParams.volume !== volume)
        instance.gain.gain.rampTo(volume, DEFAULT_RAMP_SECONDS);

      if (instance.playing !== playing) {
        instance.playing = playing;
        if (playing) {
          try {
            instance.player.start();
          } catch {
            // ignore
          }
        } else {
          try {
            instance.player.stop();
          } catch {
            // ignore
          }
        }
      }

      instance.lastParams = { ...instance.lastParams, ...params };
      instance.lastUrl = url || instance.lastUrl;

      return { value: volume };
    },
  });

  const registerLoadAudioNode = (opts: {
    type: string;
    label: string;
    inputs: NodePort[];
    configSchema: ConfigField[];
    resolveBaseUrlRaw: (inputs: Record<string, unknown>, config: Record<string, unknown>) => string;
    sensorNodeType: string;
  }) => {
    registry.register({
      type: opts.type,
      label: opts.label,
      category: 'Assets',
      inputs: opts.inputs,
      outputs: [
        { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
        { id: 'ended', label: 'Finish', type: 'boolean' },
      ],
      configSchema: opts.configSchema,
      process: (inputs, config, context) => {
        const baseUrlRaw = opts.resolveBaseUrlRaw(inputs, config);
        const url = deps.resolveAssetRef ? deps.resolveAssetRef(baseUrlRaw) : baseUrlRaw;

        const playbackRate = toNonNegativeNumber(inputs.playbackRate ?? config.playbackRate, 1);
        const detune = toNumber(inputs.detune ?? config.detune, 0);
        const volume = toAssetVolumeGain(inputs.volume ?? config.volume);
        const loop = toBoolean(inputs.loop, false);
        const playing = toBoolean(inputs.play, true);
        const reverse = toBoolean(inputs.reverse, false);

        const cursorRequestedRaw = toNumber(inputs.cursorSec, -1);
        const cursorRequested =
          typeof cursorRequestedRaw === 'number' &&
          Number.isFinite(cursorRequestedRaw) &&
          cursorRequestedRaw >= 0
            ? cursorRequestedRaw
            : null;

        const outValue = baseUrlRaw ? (playing ? 1 : 0) : 0;

        if (!toneAudioEngine.isEnabled()) {
          return { ref: outValue, ended: false };
        }

        if (!toneModule) {
          void ensureTone().catch((error) =>
            console.warn('[tone-adapter] Tone.js load failed', error)
          );
          return { ref: outValue, ended: false };
        }

        if (!url) {
          disposePlayerInstance(context.nodeId);
          return { ref: outValue, ended: false };
        }

        const hasAudioConnections = latestAudioConnections.some(
          (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
        );
        if (!hasAudioConnections) {
          if (playerInstances.has(context.nodeId)) disposePlayerInstance(context.nodeId);
          return { ref: outValue, ended: false };
        }

        let instance = playerInstances.get(context.nodeId);
        const params = {
          playbackRate,
          detune,
          volume,
          loop,
          playing,
        };

        if (!instance) {
          instance = createPlayerInstance(context.nodeId, params);
        }

        if (instance.lastUrl !== url && url) {
          const wasStarted = instance.started;
          instance.lastUrl = url;
          instance.loadedUrl = null;
          instance.failedUrl = null;
          instance.autostarted = false;
          instance.started = false;
          instance.startedAt = 0;
          instance.startOffsetSec = 0;
          instance.startDurationSec = null;
          instance.pausedOffsetSec = null;
          instance.lastClip = null;
          instance.lastCursorSec = null;
          instance.ended = false;
          instance.endedReported = false;
          instance.manualStopPending = false;
          try {
            instance.loadController?.abort();
          } catch {
            // ignore
          }
          instance.loadController = null;
          instance.loadingUrl = null;
          try {
            if (wasStarted) instance.manualStopPending = true;
            instance.player.stop();
          } catch {
            instance.manualStopPending = false;
          }
        }

        requestTonePlayerLoad(instance);

        if (instance.lastParams.playbackRate !== playbackRate)
          instance.player.playbackRate = playbackRate;
        if (instance.lastParams.detune !== detune) instance.player.detune = detune;
        if (instance.lastParams.loop !== loop) instance.player.loop = loop;
        if (instance.lastParams.volume !== volume)
          instance.gain.gain.rampTo(volume, DEFAULT_RAMP_SECONDS);

        const clipStartRaw = Math.max(0, toNumber(inputs.startSec, 0));
        const clipEndRaw = toNumber(inputs.endSec, -1);
        const clipEndCandidate =
          Number.isFinite(clipEndRaw) && clipEndRaw >= 0 ? Math.max(clipStartRaw, clipEndRaw) : -1;

        const bufferDuration = (() => {
          try {
            const dur = instance.player?.buffer?.duration;
            return typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? dur : null;
          } catch {
            return null;
          }
        })();

        const nowToneSec = toneModule!.now();

        const playbackPositionSec = (opts: {
          clipStart: number;
          resolvedClipEnd: number | null;
          loop: boolean;
          reverse: boolean;
        }): number | null => {
          if (!instance.started) return null;
          const elapsed = instance.startedAt > 0 ? Math.max(0, nowToneSec - instance.startedAt) : 0;
          const direction = opts.reverse ? -1 : 1;
          const rawPos = instance.startOffsetSec + direction * elapsed * playbackRate;
          let position = rawPos;
          const duration =
            opts.resolvedClipEnd !== null ? Math.max(0, opts.resolvedClipEnd - opts.clipStart) : null;
          if (opts.loop && duration !== null && duration > 0 && opts.resolvedClipEnd !== null) {
            if (opts.reverse) {
              const rel = opts.resolvedClipEnd - rawPos;
              const wrapped = ((rel % duration) + duration) % duration;
              position = opts.resolvedClipEnd - wrapped;
            } else {
              const rel = rawPos - opts.clipStart;
              const wrapped = ((rel % duration) + duration) % duration;
              position = opts.clipStart + wrapped;
            }
          } else if (opts.resolvedClipEnd !== null) {
            position = clamp(position, opts.clipStart, opts.resolvedClipEnd);
          } else {
            position = Math.max(opts.clipStart, position);
          }
          return position;
        };

        const activeClip = instance.lastClip;
        const activeResolvedClipEnd =
          activeClip && activeClip.endSec >= 0
            ? activeClip.endSec
            : activeClip && bufferDuration !== null
              ? bufferDuration
              : null;
        const activePlaybackPosSec = activeClip
          ? playbackPositionSec({
              clipStart: activeClip.startSec,
              resolvedClipEnd: activeResolvedClipEnd,
              loop: activeClip.loop,
              reverse: activeClip.reverse,
            })
          : null;

        let clipStart =
          bufferDuration !== null ? clamp(clipStartRaw, 0, bufferDuration) : clipStartRaw;
        let clipEnd =
          clipEndCandidate >= 0
            ? bufferDuration !== null
              ? clamp(clipEndCandidate, clipStart, bufferDuration)
              : Math.max(clipStart, clipEndCandidate)
            : -1;

        if (clipEnd >= 0 && clipEnd < clipStart) clipEnd = clipStart;

        const resolvedClipEnd =
          clipEnd >= 0 ? clipEnd : bufferDuration !== null ? bufferDuration : null;
        const resolvedClipDuration =
          resolvedClipEnd !== null ? Math.max(0, resolvedClipEnd - clipStart) : null;

        const nextClip = { startSec: clipStart, endSec: clipEnd, loop, reverse };
        const clipChanged =
          !instance.lastClip ||
          instance.lastClip.startSec !== nextClip.startSec ||
          instance.lastClip.endSec !== nextClip.endSec ||
          instance.lastClip.loop !== nextClip.loop ||
          instance.lastClip.reverse !== nextClip.reverse;

        if (clipChanged) {
          instance.ended = false;
          instance.endedReported = false;
        }

        const cursorClamped = (() => {
          if (cursorRequested === null) return null;
          const base = Math.max(clipStart, cursorRequested);
          if (resolvedClipEnd !== null) return Math.min(resolvedClipEnd, base);
          return base;
        })();

        const canApplyReverse = !reverse || bufferDuration !== null;
        const canApplyLoopEnd = resolvedClipEnd !== null;
        const canStartNow = !instance.loading && canApplyReverse && (!loop || canApplyLoopEnd);

        const applyClipToPlayer = () => {
          try {
            if (instance.lastParams.reverse !== reverse) instance.player.reverse = reverse;
          } catch {
            // ignore
          }
          try {
            instance.player.loop = loop;
          } catch {
            // ignore
          }

          if (reverse) {
            if (bufferDuration === null) return;
            const endForMap = resolvedClipEnd ?? bufferDuration;
            const loopStart = clamp(bufferDuration - endForMap, 0, bufferDuration);
            const loopEnd = clamp(bufferDuration - clipStart, loopStart, bufferDuration);
            try {
              instance.player.loopStart = loopStart;
            } catch {
              // ignore
            }
            try {
              instance.player.loopEnd = loopEnd;
            } catch {
              // ignore
            }
            return;
          }

          try {
            instance.player.loopStart = clipStart;
          } catch {
            // ignore
          }
          if (resolvedClipEnd !== null) {
            try {
              instance.player.loopEnd = resolvedClipEnd;
            } catch {
              // ignore
            }
          }
        };

        if (!instance.loading) applyClipToPlayer();

        const stopAndMaybePause = () => {
          if (!instance.started) return;
          const now = toneModule!.now();
          const elapsed = instance.startedAt > 0 ? Math.max(0, now - instance.startedAt) : 0;
          const activeReverse = instance.lastClip?.reverse ?? reverse;
          const direction = activeReverse ? -1 : 1;
          const rawPos = instance.startOffsetSec + direction * elapsed * playbackRate;
          let pausedOffset = rawPos;
          if (loop && resolvedClipDuration && resolvedClipDuration > 0 && resolvedClipEnd !== null) {
            if (activeReverse) {
              const rel = resolvedClipEnd - rawPos;
              const wrapped =
                ((rel % resolvedClipDuration) + resolvedClipDuration) % resolvedClipDuration;
              pausedOffset = resolvedClipEnd - wrapped;
            } else {
              const rel = rawPos - clipStart;
              const wrapped =
                ((rel % resolvedClipDuration) + resolvedClipDuration) % resolvedClipDuration;
              pausedOffset = clipStart + wrapped;
            }
          } else if (resolvedClipEnd !== null) {
            pausedOffset = clamp(pausedOffset, clipStart, resolvedClipEnd);
          } else {
            pausedOffset = Math.max(clipStart, pausedOffset);
          }

          instance.pausedOffsetSec = pausedOffset;
          try {
            instance.manualStopPending = true;
            instance.player.stop();
          } catch {
            instance.manualStopPending = false;
          }
          instance.started = false;
          instance.startedAt = 0;
          instance.startOffsetSec = 0;
          instance.startDurationSec = null;
        };

        const segmentStart = reverse ? (resolvedClipEnd ?? clipStart) : clipStart;

        const startFromPosition = (pos: number, reason: string) => {
          if (!canStartNow) return;
          const wasStarted = instance.started;
          instance.ended = false;
          instance.endedReported = false;
          applyClipToPlayer();
          const nextPos =
            resolvedClipEnd !== null
              ? clamp(Math.max(0, pos), clipStart, resolvedClipEnd)
              : Math.max(clipStart, pos);
          const nearEdge = 0.002;
          const noRange =
            !loop &&
            resolvedClipEnd !== null &&
            (resolvedClipDuration !== null && resolvedClipDuration <= nearEdge
              ? true
              : reverse
                ? nextPos <= clipStart + nearEdge
                : nextPos >= resolvedClipEnd - nearEdge);
          if (noRange) {
            try {
              instance.manualStopPending = false;
              if (instance.started) instance.manualStopPending = true;
              instance.player.stop();
            } catch {
              instance.manualStopPending = false;
            }
            instance.started = false;
            instance.startedAt = 0;
            instance.startOffsetSec = 0;
            instance.startDurationSec = null;
            instance.pausedOffsetSec = nextPos;
            return;
          }

          const offset = reverse ? bufferDuration! - nextPos : nextPos;

          try {
            if (instance.started) {
              instance.manualStopPending = true;
              instance.player.stop();
            }
          } catch {
            instance.manualStopPending = false;
          }

          try {
            instance.player.start(undefined, offset);
            instance.started = true;
            instance.startedAt = toneModule!.now();
            instance.startOffsetSec = nextPos;
            instance.startDurationSec = null;
            instance.pausedOffsetSec = null;

            if (!wasStarted && deps.sdk) {
              try {
                const sensorPayload: Record<string, unknown> = {
                  kind: 'node-media',
                  event: 'started',
                  nodeId: context.nodeId,
                  nodeType: opts.sensorNodeType,
                };
                deps.sdk.sendSensorData('custom', sensorPayload, { trackLatest: false });
              } catch {
                // ignore
              }
            }
          } catch (err) {
            console.warn('[tone-adapter] player start failed', { reason }, err);
          }
        };

        const cursorChanged =
          cursorClamped !== null &&
          (instance.lastCursorSec === null ||
            Math.abs(cursorClamped - instance.lastCursorSec) > 0.005);

        if (!playing) {
          stopAndMaybePause();
          instance.ended = false;
          instance.endedReported = false;
          if (cursorClamped !== null) instance.pausedOffsetSec = cursorClamped;
        } else {
          if (clipChanged && instance.started) {
            // Switching reverse while playing should keep the current position when possible.
            if (instance.lastClip && instance.lastClip.reverse !== reverse) {
              stopAndMaybePause();
              const resume = instance.pausedOffsetSec ?? segmentStart;
              instance.pausedOffsetSec = null;
              startFromPosition(resume, 'reverse-change');
            } else {
              instance.pausedOffsetSec = null;
              if (activePlaybackPosSec !== null) {
                if (activePlaybackPosSec < clipStart) {
                  startFromPosition(clipStart, 'clip-range');
                } else if (resolvedClipEnd !== null && activePlaybackPosSec > resolvedClipEnd) {
                  if (loop) startFromPosition(segmentStart, 'clip-range');
                } else {
                  instance.startOffsetSec = activePlaybackPosSec;
                  instance.startedAt = nowToneSec;
                }
              }
            }
          } else if (cursorChanged) {
            instance.pausedOffsetSec = null;
            startFromPosition(cursorClamped ?? segmentStart, 'seek');
          } else if (!instance.started && !instance.loading) {
            if (instance.ended) {
              instance.lastClip = nextClip;
              instance.lastParams = { ...instance.lastParams, ...params, reverse };
              instance.lastCursorSec = cursorClamped;
              instance.playing = playing;
              return { ref: outValue, ended: true };
            }
            const resumeOffsetRaw = instance.pausedOffsetSec ?? cursorClamped ?? segmentStart;
            // When resuming from a stopped state, `pausedOffsetSec` may be clamped to the range edge (e.g. End).
            // Starting exactly at the edge results in an immediate stop, which feels like "Play doesn't work".
            const resumeOffset = (() => {
              if (loop || resolvedClipEnd === null) return resumeOffsetRaw;
              const nearEdge = 0.002;
              if (reverse) {
                return resumeOffsetRaw <= clipStart + nearEdge ? segmentStart : resumeOffsetRaw;
              }
              return resumeOffsetRaw >= resolvedClipEnd - nearEdge ? segmentStart : resumeOffsetRaw;
            })();
            const resumeReason =
              instance.pausedOffsetSec !== null
                ? 'resume'
                : cursorClamped !== null
                  ? 'seek-start'
                  : 'start';
            startFromPosition(resumeOffset, resumeReason);
          }
        }

        instance.playing = playing;
        instance.lastClip = nextClip;
        instance.lastParams = { ...instance.lastParams, ...params, reverse };
        instance.lastCursorSec = cursorClamped;

        // Fallback: if Tone reports the player stopped but we missed the `onstop` callback,
        // treat it as a finish when Play is still enabled.
        if (playing && instance.started && !loop && !instance.ended && !instance.manualStopPending) {
          const playerStopped = (() => {
            try {
              return String(instance.player?.state ?? '') === 'stopped';
            } catch {
              return false;
            }
          })();

          if (playerStopped) {
            const fallbackEndPos =
              reverse ? clipStart : resolvedClipEnd ?? bufferDuration ?? instance.pausedOffsetSec;
            if (typeof fallbackEndPos === 'number' && Number.isFinite(fallbackEndPos)) {
              instance.pausedOffsetSec = Math.max(0, fallbackEndPos);
            }
            instance.ended = true;
            instance.started = false;
            instance.startedAt = 0;
            instance.startOffsetSec = 0;
            instance.startDurationSec = null;
          }
        }

        if (playing && instance.started && !loop && resolvedClipEnd !== null && !instance.manualStopPending) {
          const nowPos = playbackPositionSec({
            clipStart,
            resolvedClipEnd,
            loop: false,
            reverse,
          });
          if (nowPos !== null) {
            const nearEdge = 0.002;
            const reachedEnd = reverse
              ? nowPos <= clipStart + nearEdge
              : nowPos >= resolvedClipEnd - nearEdge;
            if (reachedEnd) {
              instance.pausedOffsetSec = reverse ? clipStart : resolvedClipEnd;
              instance.ended = true;
              try {
                instance.player.stop();
              } catch {
                // ignore
              }
              instance.started = false;
              instance.startedAt = 0;
              instance.startOffsetSec = 0;
              instance.startDurationSec = null;
            }
          }
        }

        if (playing && !loop && instance.ended && !instance.endedReported && deps.sdk) {
          try {
            const sensorPayload: Record<string, unknown> = {
              kind: 'node-media',
              event: 'ended',
              nodeId: context.nodeId,
              nodeType: opts.sensorNodeType,
            };
            deps.sdk.sendSensorData('custom', sensorPayload, { trackLatest: false });
            instance.endedReported = true;
          } catch {
            // ignore
          }
        }

        return { ref: outValue, ended: instance.ended };
      },
    });
  };

  registerLoadAudioNode({
    type: 'load-audio-from-assets',
    label: 'Load Audio From Remote (client)',
    inputs: [
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
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
    resolveBaseUrlRaw: (_inputs, config) => {
      const assetRaw = toString(config.assetId, '');
      const trimmed = assetRaw.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('asset:') || trimmed.startsWith('shugu://asset/')) return trimmed;
      return `asset:${trimmed}`;
    },
    sensorNodeType: 'load-audio-from-assets',
  });

  registerLoadAudioNode({
    type: 'load-audio-from-local',
    label: 'Load Audio From Local(Display only) (client)',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'string', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
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
    resolveBaseUrlRaw: (inputs, config) => {
      const fromInput = toString(inputs.asset, '').trim();
      const raw = fromInput || toString(config.assetPath, '').trim();
      return raw ? normalizeLocalMediaRef(raw, 'audio') : '';
    },
    sensorNodeType: 'load-audio-from-local',
  });

  const overrideVideoFinishOutput = (type: 'load-video-from-assets' | 'load-video-from-local') => {
    const base = registry.get(type);
    if (!base) return;
    registry.register({
      ...base,
      outputs: base.outputs.map((port) =>
        port.id === 'ended' ? { ...port, label: 'Finish' } : port
      ),
      process: (inputs, config, context) => {
        const baseOut = base.process(inputs, config, context) as Record<string, unknown>;
        const nodeId = context.nodeId;
        const now = Date.now();
        pruneVideoFinishStates(now);

        const signature = videoFinishSignatureFromRef(baseOut?.ref);
        if (!signature) {
          videoFinishStates.delete(nodeId);
          // Drain any pending finish pulses so stale ends don't apply after reloads.
          consumeNodeMediaFinishPulse(nodeId);
          return { ...baseOut, ended: false };
        }

        const existing = videoFinishStates.get(nodeId) ?? {
          signature: '',
          lastPlay: false,
          finished: false,
          updatedAt: now,
        };

        const playActive = toBoolean(inputs.play, true);
        const playRising = playActive && !existing.lastPlay;

        const finished = (() => {
          if (signature !== existing.signature) return false;
          if (!playActive || playRising) return false;
          if (consumeNodeMediaFinishPulse(nodeId)) return true;
          return existing.finished;
        })();

        videoFinishStates.set(nodeId, {
          signature,
          lastPlay: playActive,
          finished,
          updatedAt: now,
        });

        return { ...baseOut, ended: finished };
      },
    });
  };

  overrideVideoFinishOutput('load-video-from-assets');
  overrideVideoFinishOutput('load-video-from-local');

  const handle: ToneAdapterHandle = {
    disposeNode: (nodeId: string) => {
      disposeNodeById(nodeId);
    },
    disposeAll: () => {
      for (const nodeId of Array.from(oscInstances.keys())) disposeOscInstance(nodeId);
      for (const nodeId of Array.from(audioDataInstances.keys())) disposeAudioDataInstance(nodeId);
      for (const nodeId of Array.from(effectInstances.keys())) disposeEffectInstance(nodeId);
      for (const nodeId of Array.from(granularInstances.keys())) disposeGranularInstance(nodeId);
      for (const nodeId of Array.from(playerInstances.keys())) disposePlayerInstance(nodeId);
      for (const nodeId of Array.from(lfoInstances.keys())) disposeToneLfoInstance(nodeId);
      latestGraphNodesById.clear();
      latestAudioConnections.length = 0;
      latestToneLfoConnections.length = 0;
      latestToneLfoDesiredTargets.clear();
      latestToneLfoActiveTargets.clear();
      maybeStopTransport();
    },
    syncActiveNodes: (
      activeNodeIds: Set<string>,
      nodes: NodeInstance[],
      connections: Connection[]
    ) => {
      updateAudioGraphSnapshot(registry, nodes ?? [], connections ?? []);

      // Best-effort: reset per-node video Finish state on each deploy.
      const now = Date.now();
      pruneVideoFinishStates(now);
      const activeVideoNodeIds = new Set(
        (nodes ?? [])
          .filter(
            (node) =>
              node.type === 'load-video-from-assets' || node.type === 'load-video-from-local'
          )
          .map((node) => node.id)
      );
      for (const nodeId of Array.from(videoFinishStates.keys())) {
        if (!activeVideoNodeIds.has(nodeId)) videoFinishStates.delete(nodeId);
      }
      for (const nodeId of activeVideoNodeIds) {
        consumeNodeMediaFinishPulse(nodeId);
        videoFinishStates.set(nodeId, {
          signature: '',
          lastPlay: false,
          finished: false,
          updatedAt: now,
        });
      }

      for (const nodeId of Array.from(oscInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeOscInstance(nodeId);
      }
      for (const nodeId of Array.from(audioDataInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeAudioDataInstance(nodeId);
      }
      for (const nodeId of Array.from(effectInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeEffectInstance(nodeId);
      }
      for (const nodeId of Array.from(granularInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeGranularInstance(nodeId);
      }
      for (const nodeId of Array.from(playerInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposePlayerInstance(nodeId);
      }
      for (const nodeId of Array.from(lfoInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeToneLfoInstance(nodeId);
      }

      scheduleGraphWiring();
    },
  };

  return handle;
}
