/**
 * Purpose: Register Tone oscillator, LFO, and audio-data nodes.
 */
import type { NodeRegistry, ProcessContext } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps } from '../types.js';
import { DEFAULT_RAMP_SECONDS, audioDataInstances, ensureTone, latestAudioConnections, latestToneLfoConnections, lfoInstances, oscInstances, toneModule } from '../state.js';
import { maybeStopTransport } from '../engine-host.js';
import { analyzeAudioDataInstance, createAudioDataInstance, createOscInstance, createToneLfoInstance, disposeAudioDataInstance, disposeLoop, disposeOscInstance, disposeToneLfoInstance, normalizeAudioDataConfig, parseLoopPattern, updateAudioDataInstance, updateLoop, updateToneLfoInstance } from '../nodes.js';
import { clamp, loopKeyOf, toNumber, toString } from '../utils.js';

export function registerOscLfoAudioDataNodes(registry: NodeRegistry, deps: ToneAdapterDeps): void {
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
}
