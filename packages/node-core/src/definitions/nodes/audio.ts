/**
 * Purpose: Audio-related node definitions (Tone placeholders, analysis, etc.).
 */
import type { NodeDefinition } from '../../types.js';

export function createAudioDataNode(): NodeDefinition {
  return {
    type: 'audio-data',
    label: 'Audio Data',
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
    process: (inputs) => ({
      out: (inputs.in as number) ?? 0,
      rms: 0,
      peak: 0,
      low: 0,
      mid: 0,
      high: 0,
      centroidHz: 0,
      bpm: 0,
      beat: false,
    }),
  };
}

const TONE_LFO_WAVEFORM_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
] as const satisfies { value: string; label: string }[];

export function createToneLFONode(): NodeDefinition {
  return {
    type: 'tone-lfo',
    label: 'Tone LFO',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'number', defaultValue: 1 },
      {
        id: 'frequencyHz',
        label: 'Freq (Hz)',
        type: 'number',
        defaultValue: 1,
        min: 0,
        step: 0.01,
      },
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0, step: 0.01 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 1, step: 0.01 },
      {
        id: 'amplitude',
        label: 'Depth',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
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
        options: TONE_LFO_WAVEFORM_OPTIONS as unknown as { value: string; label: string }[],
      },
    ],
    process: (inputs, config, context) => {
      const scaleRaw = inputs.in;
      const scale =
        typeof scaleRaw === 'number' && Number.isFinite(scaleRaw) ? (scaleRaw as number) : 1;
      const frequencyHz =
        typeof inputs.frequencyHz === 'number'
          ? (inputs.frequencyHz as number)
          : Number(config.frequencyHz ?? 1);
      const min = typeof inputs.min === 'number' ? (inputs.min as number) : Number(config.min ?? 0);
      const max = typeof inputs.max === 'number' ? (inputs.max as number) : Number(config.max ?? 1);
      const amplitudeRaw =
        typeof inputs.amplitude === 'number'
          ? (inputs.amplitude as number)
          : Number(config.amplitude ?? 1);
      const amplitude = Number.isFinite(amplitudeRaw) ? Math.max(0, Math.min(1, amplitudeRaw)) : 1;

      const waveform = (() => {
        const v = inputs.waveform;
        if (typeof v === 'string' && v.trim()) return v.trim();
        return String(config.waveform ?? 'sine');
      })();

      const scaledMin = min * scale;
      const scaledMax = max * scale;

      const freq = Number.isFinite(frequencyHz) ? Math.max(0, frequencyHz) : 1;
      const phase = (context.time / 1000) * freq * 2 * Math.PI;

      let normalized: number;
      switch (waveform) {
        case 'sine':
          normalized = (Math.sin(phase) + 1) / 2;
          break;
        case 'square':
          normalized = Math.sin(phase) >= 0 ? 1 : 0;
          break;
        case 'triangle':
          normalized = Math.abs((((context.time / 1000) * freq * 2) % 2) - 1);
          break;
        case 'sawtooth':
          normalized = ((context.time / 1000) * freq) % 1;
          break;
        default:
          normalized = (Math.sin(phase) + 1) / 2;
      }

      const centered = 0.5 + (normalized - 0.5) * amplitude;
      const value = scaledMin + centered * (scaledMax - scaledMin);
      return { value };
    },
  };
}

export function createToneOscNode(): NodeDefinition {
  return {
    type: 'tone-osc',
    label: 'Tone Osc',
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
      {
        key: 'loop',
        label: 'Loop (pattern)',
        type: 'string',
        defaultValue: '',
      },
    ],
    process: (inputs, _config) => {
      const ampInput = Number(inputs.amplitude ?? 0);
      const value = Number.isFinite(ampInput) ? ampInput : 0;
      return { value };
    },
  };
}

export function createToneDelayNode(): NodeDefinition {
  return {
    type: 'tone-delay',
    label: 'Tone Delay',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: 0.001 },
      { id: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 1 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: 0.001 },
      { key: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 1 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    process: (inputs) => ({ out: (inputs.in as number) ?? 0 }),
  };
}

export function createToneResonatorNode(): NodeDefinition {
  return {
    type: 'tone-resonator',
    label: 'Tone Resonator',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      {
        id: 'resonance',
        label: 'Resonance',
        type: 'number',
        defaultValue: 0.6,
        min: 0,
        max: 0.9999,
      },
      { id: 'dampening', label: 'Dampening', type: 'number', defaultValue: 3000 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      {
        key: 'resonance',
        label: 'Resonance',
        type: 'number',
        defaultValue: 0.6,
        min: 0,
        max: 0.9999,
      },
      { key: 'dampening', label: 'Dampening (Hz)', type: 'number', defaultValue: 3000 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4 },
    ],
    process: (inputs) => ({ out: (inputs.in as number) ?? 0 }),
  };
}

export function createTonePitchNode(): NodeDefinition {
  return {
    type: 'tone-pitch',
    label: 'Tone Pitch',
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
    process: (inputs) => ({ out: (inputs.in as number) ?? 0 }),
  };
}

export function createToneReverbNode(): NodeDefinition {
  return {
    type: 'tone-reverb',
    label: 'Tone Reverb',
    category: 'Audio',
    inputs: [
      { id: 'in', label: 'In', type: 'audio', kind: 'sink' },
      { id: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6, min: 0.001 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6, min: 0.001 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3 },
    ],
    process: (inputs) => ({ out: (inputs.in as number) ?? 0 }),
  };
}

export function createToneGranularNode(): NodeDefinition {
  return {
    type: 'tone-granular',
    label: 'Tone Granular',
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
    process: (inputs, config) => {
      const volume =
        typeof inputs.volume === 'number'
          ? (inputs.volume as number)
          : Number(config.volume ?? 0.6);
      return { value: volume };
    },
  };
}
