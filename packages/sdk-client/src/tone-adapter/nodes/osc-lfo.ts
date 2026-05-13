/**
 * Purpose: Manage Tone oscillator, LFO, and loop instances.
 */
import type { LFOOptions, ToneOscillatorType } from 'tone';
import type { LoopEvent, ParsedLoop, ToneAdapterDeps, ToneGainLike, ToneLfoInstance, ToneLfoLike, ToneLoopLike, ToneOscInstance, ToneOscillatorLike } from '../types.js';
import { DEFAULT_RAMP_SECONDS, lfoInstances, oscInstances, toneModule, transportState } from '../state.js';
import { ensureTransportStart, scheduleGraphWiring } from '../engine-host.js';

export function createOscInstance(
  nodeId: string,
  frequency: number,
  amplitude: number,
  waveform: string
): ToneOscInstance {
  if (!toneModule) throw new Error('Tone module is not loaded');

  const oscType = waveform as ToneOscillatorType;
  const osc = new toneModule.Oscillator(frequency, oscType);
  const gain = new toneModule.Gain({ gain: amplitude });
  osc.connect(gain);
  osc.start();

  const instance: ToneOscInstance = {
    osc: osc as unknown as ToneOscillatorLike,
    gain: gain as unknown as ToneGainLike,
    loop: null,
    loopKey: null,
    loopDefaults: null,
    lastFrequency: frequency,
    lastAmplitude: amplitude,
    lastWaveform: waveform,
    lastLoopLength: null,
  };

  oscInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

export function createToneLfoInstance(
  nodeId: string,
  params: { frequencyHz: number; min: number; max: number; amplitude: number; waveform: string }
): ToneLfoInstance {
  if (!toneModule) throw new Error('Tone module is not loaded');

  const min = Math.min(params.min, params.max);
  const max = Math.max(params.min, params.max);
  const lfoOptions: Partial<LFOOptions> = {
    frequency: params.frequencyHz,
    min,
    max,
    amplitude: params.amplitude,
    units: 'number',
    type: params.waveform as ToneOscillatorType,
  };
  const lfo = new toneModule.LFO(lfoOptions);

  try {
    lfo.amplitude.value = params.amplitude;
  } catch {
    // ignore
  }

  const instance: ToneLfoInstance = {
    nodeId,
    lfo: lfo as unknown as ToneLfoLike,
    started: false,
    lastParams: { ...params, min, max },
  };

  try {
    lfo.start();
    instance.started = true;
  } catch {
    // ignore
  }

  lfoInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

export function updateToneLfoInstance(
  instance: ToneLfoInstance,
  params: {
    frequencyHz: number;
    min: number;
    max: number;
    amplitude: number;
    waveform: string;
  }
): void {
  const min = Math.min(params.min, params.max);
  const max = Math.max(params.min, params.max);

  if (instance.lastParams.waveform !== params.waveform) {
    try {
      instance.lfo.type = params.waveform;
    } catch {
      // ignore
    }
  }

  if (instance.lastParams.frequencyHz !== params.frequencyHz) {
    try {
      instance.lfo.frequency.rampTo(params.frequencyHz, DEFAULT_RAMP_SECONDS);
    } catch {
      try {
        instance.lfo.frequency.value = params.frequencyHz;
      } catch {
        // ignore
      }
    }
  }

  if (instance.lastParams.min !== min) {
    try {
      instance.lfo.min = min;
    } catch {
      // ignore
    }
  }

  if (instance.lastParams.max !== max) {
    try {
      instance.lfo.max = max;
    } catch {
      // ignore
    }
  }

  if (instance.lastParams.amplitude !== params.amplitude) {
    try {
      instance.lfo.amplitude.rampTo(params.amplitude, DEFAULT_RAMP_SECONDS);
    } catch {
      try {
        instance.lfo.amplitude.value = params.amplitude;
      } catch {
        // ignore
      }
    }
  }

  if (!instance.started) {
    try {
      instance.lfo.start();
      instance.started = true;
      scheduleGraphWiring();
    } catch {
      // ignore
    }
  }

  instance.lastParams = { ...instance.lastParams, ...params, min, max };
}

export function updateLoop(
  instance: ToneOscInstance,
  parsed: ParsedLoop,
  deps: ToneAdapterDeps,
  startAtServerTimeMs?: number
): void {
  if (!toneModule) return;

  if (!instance.loop) {
    instance.loop = new toneModule.Part((time: number, event: LoopEvent) => {
      if (!instance.osc || !instance.gain) return;
      if (typeof event.frequency === 'number' && Number.isFinite(event.frequency)) {
        instance.osc.frequency.setValueAtTime(event.frequency, time);
      }
      if (typeof event.amplitude === 'number' && Number.isFinite(event.amplitude)) {
        instance.gain.gain.setValueAtTime(event.amplitude, time);
      }
    }, []) as unknown as ToneLoopLike;
    instance.loop.loop = true;
  }

  const loop = instance.loop;
  loop.clear();
  parsed.events.forEach((event) => loop.add(event.time, event));
  loop.loopStart = 0;
  loop.loopEnd = parsed.loopLengthSeconds;
  instance.lastLoopLength = parsed.loopLengthSeconds;

  if (!loop.state || loop.state !== 'started') {
    if (transportState.started) {
      loop.start(toneModule.Transport.seconds);
    } else {
      loop.start(0);
    }
  }

  ensureTransportStart(deps, startAtServerTimeMs ?? parsed.startAtServerTimeMs);
}

export function disposeLoop(instance: ToneOscInstance): void {
  if (!instance.loop) return;
  try {
    instance.loop.stop();
    instance.loop.dispose();
  } catch {
    // ignore dispose errors
  }
  instance.loop = null;
  instance.loopKey = null;
  instance.lastLoopLength = null;
}
