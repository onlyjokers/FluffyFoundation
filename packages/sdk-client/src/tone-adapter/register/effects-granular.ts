/**
 * Purpose: Register Tone effect and granular nodes.
 */
import type { NodeRegistry, ProcessContext } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps, ToneEffectKind } from '../types.js';
import { DEFAULT_RAMP_SECONDS, MIN_TONE_DELAY_TIME_SECONDS, effectInstances, ensureTone, granularInstances, latestAudioConnections, toneModule } from '../state.js';
import { createEffectInstance, createGranularInstance, disposeEffectInstance, disposeGranularInstance, updateEffectInstance } from '../nodes.js';
import { clamp, toBoolean, toNumber, toString } from '../utils.js';
import { normalizeRemoteAssetRef } from './asset-ref.js';

export function registerEffectsAndGranularNodes(registry: NodeRegistry, deps: ToneAdapterDeps): void {
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
      { id: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: MIN_TONE_DELAY_TIME_SECONDS, max: 60 },
      { id: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 0.95 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'time', label: 'Time (s)', type: 'number', defaultValue: 0.25, min: MIN_TONE_DELAY_TIME_SECONDS, max: 60 },
      { key: 'feedback', label: 'Feedback', type: 'number', defaultValue: 0.35, min: 0, max: 0.95 },
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
      { id: 'resonance', label: 'Resonance', type: 'number', defaultValue: 0.6, min: 0, max: 0.9999 },
      { id: 'dampening', label: 'Dampening', type: 'number', defaultValue: 3000, min: 20, max: 20000 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4, min: 0, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'resonance', label: 'Resonance', type: 'number', defaultValue: 0.6, min: 0, max: 0.9999 },
      { key: 'dampening', label: 'Dampening (Hz)', type: 'number', defaultValue: 3000, min: 20, max: 20000 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.4, min: 0, max: 1 },
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
      { id: 'pitch', label: 'Pitch (st)', type: 'number', defaultValue: 0, min: -24, max: 24 },
      { id: 'windowSize', label: 'Window', type: 'number', defaultValue: 0.1, min: 0.001, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'pitch', label: 'Pitch (st)', type: 'number', defaultValue: 0, min: -24, max: 24 },
      { key: 'windowSize', label: 'Window', type: 'number', defaultValue: 0.1, min: 0.001, max: 1 },
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
      { id: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6, min: 0.001, max: 60 },
      { id: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'decay', label: 'Decay (s)', type: 'number', defaultValue: 1.6, min: 0.001, max: 60 },
      { key: 'wet', label: 'Wet', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
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
      { id: 'gate', label: 'Gate', type: 'number', defaultValue: 0, min: 0, max: 1 },
      { id: 'loop', label: 'Loop', type: 'boolean' },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0.01, max: 4 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0, min: -2400, max: 2400 },
      { id: 'grainSize', label: 'Grain (s)', type: 'number', defaultValue: 0.2, min: 0.001, max: 2 },
      { id: 'overlap', label: 'Overlap (s)', type: 'number', defaultValue: 0.1, min: 0, max: 2 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0.6, min: 0, max: 2 },
    ],
    outputs: [{ id: 'value', label: 'Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'url', label: 'Audio Asset', type: 'asset-picker', assetKind: 'audio', defaultValue: '' },
      { key: 'loop', label: 'Loop', type: 'boolean', defaultValue: true },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0.01, max: 4 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0, min: -2400, max: 2400 },
      { key: 'grainSize', label: 'Grain (s)', type: 'number', defaultValue: 0.2, min: 0.001, max: 2 },
      { key: 'overlap', label: 'Overlap (s)', type: 'number', defaultValue: 0.1, min: 0, max: 2 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0.6, min: 0, max: 2 },
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
}
