/**
 * Purpose: Tone adapter node implementations (instances, DSP helpers, node-local scheduling).
 */

import type {
  AudioDataInstance,
  EffectWrapper,
  LoopEvent,
  ParsedLoop,
  ToneAdapterDeps,
  ToneEffectKind,
  ToneEffectInstance,
  ToneGranularInstance,
  ToneLfoInstance,
  ToneOscInstance,
  TonePlayerInstance,
} from './types.js';
import type { LFOOptions, OscillatorType, PlayerOptions } from 'tone';
import {
  DEFAULT_RAMP_SECONDS,
  DEFAULT_STEP_SECONDS,
  FIXED_TONE_PITCH_FEEDBACK,
  FIXED_TONE_PITCH_WET,
  FIXED_TONE_PITCH_DELAY_SECONDS,
  FIXED_TONE_RESONATOR_DELAY_SECONDS,
  FIXED_TONE_REVERB_PREDELAY_SECONDS,
  MIN_TONE_DELAY_TIME_SECONDS,
  audioDataInstances,
  effectInstances,
  granularInstances,
  latestDeps,
  lfoInstances,
  oscInstances,
  playerInstances,
  toneModule,
  transportState,
} from './state.js';
import {
  ensureTransportStart,
  isToneLfoTargetActive,
  maybeStopTransport,
  scheduleGraphWiring,
} from './engine-host.js';
import {
  clamp,
  toBoolean,
  toNonNegativeNumber,
  toNumber,
  toToneDelayTimeSeconds,
} from './utils.js';
import { getToneRawContext } from './tone-guards.js';
export function parseLoopPattern(
  raw: unknown,
  defaults: { frequency: number; amplitude: number }
): ParsedLoop | null {
  if (raw == null) return null;

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        value = trimmed;
      }
    } else {
      value = trimmed;
    }
  }

  if (Array.isArray(value)) {
    return parseLoopArray(value, defaults, DEFAULT_STEP_SECONDS);
  }

  if (typeof value === 'object' && value) {
    return parseLoopObject(value as Record<string, unknown>, defaults);
  }

  if (typeof value === 'string') {
    return parseLoopString(value, defaults, DEFAULT_STEP_SECONDS);
  }

  return null;
}

function parseLoopString(
  value: string,
  defaults: { frequency: number; amplitude: number },
  stepSeconds: number
): ParsedLoop | null {
  const tokens = value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const events: LoopEvent[] = tokens.map((token, index) => ({
    time: index * stepSeconds,
    amplitude: toNumber(token, defaults.amplitude),
  }));
  return { events, loopLengthSeconds: tokens.length * stepSeconds };
}

function parseLoopArray(
  values: unknown[],
  defaults: { frequency: number; amplitude: number },
  stepSeconds: number
): ParsedLoop | null {
  if (values.length === 0) return null;

  const allNumbers = values.every(
    (item) => typeof item === 'number' || (typeof item === 'string' && item.trim() !== '')
  );
  if (allNumbers) {
    const events = values.map((item, index) => ({
      time: index * stepSeconds,
      amplitude: toNumber(item, defaults.amplitude),
    }));
    return { events, loopLengthSeconds: values.length * stepSeconds };
  }

  const events: LoopEvent[] = [];
  let maxTime = 0;
  values.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const time = resolveEventTime(record, index, stepSeconds);
    if (time == null) return;
    const frequency = resolveFrequency(record, defaults.frequency);
    const amplitude = resolveAmplitude(record, defaults.amplitude);
    events.push({ time, frequency, amplitude });
    if (time > maxTime) maxTime = time;
  });

  if (events.length === 0) return null;
  return { events, loopLengthSeconds: maxTime + stepSeconds };
}

function parseLoopObject(
  value: Record<string, unknown>,
  defaults: { frequency: number; amplitude: number }
): ParsedLoop | null {
  const tempo = toNumber(value.tempo, 120);
  const stepBeats = toNumber(value.stepBeats ?? value.step, 0.25);
  const stepMs = toNumber(value.stepMs, 0);
  const stepSeconds = stepMs > 0 ? stepMs / 1000 : (60 / tempo) * stepBeats;

  const startAtServerTimeMs = toNumber(
    value.startAtServerTimeMs ?? value.startAt ?? value.executeAt ?? value.startAtServerTime,
    NaN
  );

  const eventsSource = Array.isArray(value.steps)
    ? value.steps
    : Array.isArray(value.events)
      ? value.events
      : null;

  if (!eventsSource) return null;

  const parsed = parseLoopArray(eventsSource, defaults, stepSeconds);
  if (!parsed) return null;

  const loopLengthMs = toNumber(value.loopLengthMs, 0);
  const loopLengthSeconds = toNumber(value.loopLengthSeconds ?? value.loopLength, 0);
  const resolvedLoopLength =
    loopLengthMs > 0
      ? loopLengthMs / 1000
      : loopLengthSeconds > 0
        ? loopLengthSeconds
        : parsed.loopLengthSeconds;

  return {
    events: parsed.events,
    loopLengthSeconds: Math.max(resolvedLoopLength, 0.01),
    startAtServerTimeMs: Number.isFinite(startAtServerTimeMs) ? startAtServerTimeMs : undefined,
  };
}

function resolveEventTime(
  record: Record<string, unknown>,
  index: number,
  stepSeconds: number
): number | null {
  if (typeof record.timeMs === 'number') return record.timeMs / 1000;
  if (typeof record.time === 'number') return record.time;
  if (typeof record.timeSeconds === 'number') return record.timeSeconds;
  if (typeof record.step === 'number') return record.step * stepSeconds;
  if (typeof record.index === 'number') return record.index * stepSeconds;
  return index * stepSeconds;
}

function resolveFrequency(record: Record<string, unknown>, fallback: number): number | undefined {
  if (typeof record.frequency === 'number') return record.frequency;
  if (typeof record.freq === 'number') return record.freq;
  if (typeof record.pitch === 'number') return record.pitch;
  return fallback;
}

function resolveAmplitude(record: Record<string, unknown>, fallback: number): number | undefined {
  if (typeof record.amplitude === 'number') return record.amplitude;
  if (typeof record.amp === 'number') return record.amp;
  if (typeof record.velocity === 'number') return record.velocity;
  return fallback;
}

export function createOscInstance(
  nodeId: string,
  frequency: number,
  amplitude: number,
  waveform: string
): ToneOscInstance {
  if (!toneModule) throw new Error('Tone module is not loaded');

  const oscType = waveform as OscillatorType;
  const osc = new toneModule.Oscillator({ frequency, type: oscType });
  const gain = new toneModule.Gain({ gain: amplitude });
  osc.connect(gain);
  osc.start();

  const instance: ToneOscInstance = {
    osc,
    gain,
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
  const lfoOptions: LFOOptions = {
    frequency: params.frequencyHz,
    min,
    max,
    type: params.waveform as OscillatorType,
  };
  const lfo = new toneModule.LFO(lfoOptions);

  try {
    lfo.amplitude.value = params.amplitude;
  } catch {
    // ignore
  }

  const instance: ToneLfoInstance = {
    nodeId,
    lfo,
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
    }, []);
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

function createDelayEffect(time: number, feedback: number, wet: number): EffectWrapper {
  const effect = new toneModule!.FeedbackDelay({
    delayTime: toToneDelayTimeSeconds(time, MIN_TONE_DELAY_TIME_SECONDS),
    feedback,
    wet,
  });
  const setWet = (value: number) => effect.wet.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input: effect,
    output: effect,
    effect,
    wetParam: effect.wet,
    setWet,
    dispose: () => effect.dispose(),
  };
}

function createReverbEffect(decay: number, wet: number): EffectWrapper {
  const effect = new toneModule!.Reverb({ decay, preDelay: FIXED_TONE_REVERB_PREDELAY_SECONDS, wet });
  const setWet = (value: number) => effect.wet.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input: effect,
    output: effect,
    effect,
    wetParam: effect.wet,
    setWet,
    dispose: () => effect.dispose(),
  };
}

function createPitchEffect(
  pitch: number,
  windowSize: number,
  feedback: number,
  wet: number
): EffectWrapper {
  const effect = new toneModule!.PitchShift({
    pitch,
    windowSize,
    delayTime: FIXED_TONE_PITCH_DELAY_SECONDS,
    feedback,
    wet,
  });
  const setWet = (value: number) => effect.wet.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input: effect,
    output: effect,
    effect,
    wetParam: effect.wet,
    setWet,
    dispose: () => effect.dispose(),
  };
}

function createResonatorEffect(
  resonance: number,
  dampening: number,
  wet: number
): EffectWrapper {
  const input = new toneModule!.Gain({ gain: 1 });
  const comb = new toneModule!.LowpassCombFilter({
    delayTime: FIXED_TONE_RESONATOR_DELAY_SECONDS,
    resonance,
    dampening,
  });
  const crossfade = new toneModule!.CrossFade({ fade: wet });
  input.connect(crossfade.a);
  input.connect(comb);
  comb.connect(crossfade.b);
  const setWet = (value: number) => crossfade.fade.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input,
    output: crossfade,
    effect: comb,
    wetParam: crossfade.fade,
    setWet,
    dispose: () => {
      input.dispose();
      comb.dispose();
      crossfade.dispose();
    },
  };
}

export function createEffectInstance(
  kind: ToneEffectKind,
  params: Record<string, number>,
  nodeId: string
): ToneEffectInstance {
  const safeParams: Record<string, number> = { ...params };
  let wrapper: EffectWrapper;
  switch (kind) {
    case 'tone-delay': {
      safeParams.time = toToneDelayTimeSeconds(params.time, 0.25);
      safeParams.feedback = clamp(params.feedback, 0, 1);
      safeParams.wet = clamp(params.wet, 0, 1);
      wrapper = createDelayEffect(safeParams.time, safeParams.feedback, safeParams.wet);
      break;
    }
    case 'tone-reverb':
      wrapper = createReverbEffect(params.decay, clamp(params.wet, 0, 1));
      break;
    case 'tone-pitch':
      safeParams.feedback = FIXED_TONE_PITCH_FEEDBACK;
      safeParams.wet = FIXED_TONE_PITCH_WET;
      wrapper = createPitchEffect(
        params.pitch,
        params.windowSize,
        FIXED_TONE_PITCH_FEEDBACK,
        FIXED_TONE_PITCH_WET
      );
      break;
    case 'tone-resonator':
      wrapper = createResonatorEffect(
        clamp(params.resonance, 0, 1),
        params.dampening,
        clamp(params.wet, 0, 1)
      );
      break;
  }

  const instance: ToneEffectInstance = {
    nodeId,
    kind,
    wrapper,
    lastParams: { ...safeParams },
  };

  effectInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

export function updateEffectInstance(
  instance: ToneEffectInstance,
  nextParams: Record<string, number>
): void {
  const applyWet = (value: number) => {
    if (instance.wrapper.setWet) {
      instance.wrapper.setWet(value);
    }
  };

  switch (instance.kind) {
    case 'tone-delay': {
      const effect = instance.wrapper.effect;
      const time = toToneDelayTimeSeconds(nextParams.time, 0.25);
      const feedback = clamp(nextParams.feedback, 0, 1);
      const wet = clamp(nextParams.wet, 0, 1);
      if (instance.lastParams.time !== time && !isToneLfoTargetActive(instance.nodeId, 'time')) {
        effect.delayTime.rampTo(time, DEFAULT_RAMP_SECONDS);
      }
      if (
        instance.lastParams.feedback !== feedback &&
        !isToneLfoTargetActive(instance.nodeId, 'feedback')
      ) {
        effect.feedback.rampTo(feedback, DEFAULT_RAMP_SECONDS);
      }
      if (
        instance.lastParams.wet !== wet &&
        !isToneLfoTargetActive(instance.nodeId, 'wet')
      ) {
        applyWet(wet);
      }
      instance.lastParams = { ...instance.lastParams, ...nextParams, time, feedback, wet };
      break;
    }
    case 'tone-reverb': {
      const effect = instance.wrapper.effect;
      const decay = nextParams.decay;
      const wet = clamp(nextParams.wet, 0, 1);
      if (instance.lastParams.decay !== decay) effect.decay = decay;
      if (!instance.pendingGenerate && instance.lastParams.decay !== decay) {
        instance.pendingGenerate = true;
        void effect
          .generate()
          .catch((error: unknown) => {
            console.warn('[tone-adapter] reverb generate failed', error);
          })
          .finally(() => {
            instance.pendingGenerate = false;
          });
      }
      if (
        instance.lastParams.wet !== wet &&
        !isToneLfoTargetActive(instance.nodeId, 'wet')
      ) {
        applyWet(wet);
      }
      instance.lastParams = { ...instance.lastParams, ...nextParams };
      break;
    }
    case 'tone-pitch': {
      const effect = instance.wrapper.effect;
      const pitch = nextParams.pitch;
      const windowSize = nextParams.windowSize;
      const feedback = FIXED_TONE_PITCH_FEEDBACK;
      const wet = FIXED_TONE_PITCH_WET;
      if (instance.lastParams.pitch !== pitch) effect.pitch = pitch;
      if (instance.lastParams.windowSize !== windowSize) effect.windowSize = windowSize;
      if (instance.lastParams.feedback !== feedback) effect.feedback = feedback;
      if (
        instance.lastParams.wet !== wet &&
        !isToneLfoTargetActive(instance.nodeId, 'wet')
      ) {
        applyWet(wet);
      }
      instance.lastParams = { ...instance.lastParams, ...nextParams, feedback, wet };
      break;
    }
    case 'tone-resonator': {
      const comb = instance.wrapper.effect;
      const resonance = clamp(nextParams.resonance, 0, 1);
      const dampening = nextParams.dampening;
      const wet = clamp(nextParams.wet, 0, 1);
      if (instance.lastParams.resonance !== resonance) comb.resonance = resonance;
      if (instance.lastParams.dampening !== dampening) comb.dampening = dampening;
      if (
        instance.lastParams.wet !== wet &&
        !isToneLfoTargetActive(instance.nodeId, 'wet')
      ) {
        applyWet(wet);
      }
      instance.lastParams = { ...instance.lastParams, ...nextParams };
      break;
    }
  }
}

export function createGranularInstance(
  nodeId: string,
  url: string,
  params: Record<string, number | boolean>
): ToneGranularInstance {
  const gain = new toneModule!.Gain({ gain: params.volume as number });
  const player = new toneModule!.GrainPlayer({
    url,
    loop: params.loop as boolean,
    grainSize: params.grainSize as number,
    overlap: params.overlap as number,
    playbackRate: params.playbackRate as number,
    detune: params.detune as number,
    onload: () => {
      if (granularInstances.get(nodeId)?.playing) {
        try {
          player.start();
        } catch {
          // ignore
        }
      }
    },
  });

  player.connect(gain);

  const instance: ToneGranularInstance = {
    nodeId,
    player,
    gain,
    playing: Boolean(params.playing),
    lastUrl: url,
    lastParams: { ...params },
  };

  if (instance.playing) {
    try {
      player.start();
    } catch {
      // ignore
    }
  }

  granularInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) return error.name === 'AbortError' || error.message.includes('AbortError');
  return String(error).includes('AbortError');
}

/**
 * Ensure Tone.Player loads are serialized and cancelable.
 *
 * ToneAudioBuffer.load (used by Tone.Player.load) does `fetch(url)` without AbortSignal support,
 * so rapid URL switching can accumulate concurrent downloads/decodes and stall the main thread.
 *
 * Strategy:
 * - Keep a single in-flight load per nodeId.
 * - Abort the fetch stage when a newer URL arrives (best-effort).
 * - Never apply stale load results (URL/seq checks).
 */
export function requestTonePlayerLoad(instance: TonePlayerInstance): void {
  if (!toneModule) return;
  if (instance.loading) return;
  const url = instance.lastUrl;
  if (!url) return;
  if (instance.loadedUrl === url) return;
  if (instance.failedUrl === url) return;
  void startTonePlayerLoad(instance, url);
}

async function startTonePlayerLoad(instance: TonePlayerInstance, url: string): Promise<void> {
  if (!toneModule) return;

  const seq = instance.loadSeq + 1;
  instance.loadSeq = seq;
  instance.loading = true;
  instance.loadingUrl = url;
  instance.failedUrl = null;

  try {
    instance.loadController?.abort();
  } catch {
    // ignore
  }
  const controller = new AbortController();
  instance.loadController = controller;

  try {
    let arrayBuffer: ArrayBuffer;

    // Use prioritizeFetch if available (checks cache, prioritizes over background preload).
    if (latestDeps.prioritizeFetch) {
      const res = await latestDeps.prioritizeFetch(url);
      if (!res.ok) throw new Error(`GET failed (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`GET failed (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    }

    if (controller.signal.aborted) return;

    const audioBuffer = await toneModule.getContext().decodeAudioData(arrayBuffer);
    if (controller.signal.aborted) return;

    const current = playerInstances.get(instance.nodeId);
    if (!current || current.loadSeq !== seq) return;
    if (current.lastUrl !== url) return;

    current.player.buffer = audioBuffer;
    current.loadedUrl = url;
    current.failedUrl = null;
  } catch (error: unknown) {
    if (isAbortError(error)) return;
    const current = playerInstances.get(instance.nodeId);
    if (current && current.loadSeq === seq && current.lastUrl === url) {
      current.failedUrl = url;
    }
    console.warn('[tone-adapter] player load failed', { url }, error);
  } finally {
    const current = playerInstances.get(instance.nodeId);
    if (current && current.loadSeq === seq) {
      current.loading = false;
      current.loadingUrl = null;
      current.loadController = null;

      // If URL changed while we were loading, kick the next load (no concurrency).
      requestTonePlayerLoad(current);
    }
  }
}

export function createPlayerInstance(
  nodeId: string,
  params: Record<string, number | boolean>
): TonePlayerInstance {
  const gain = new toneModule!.Gain({ gain: params.volume as number });
  const playbackRate = toNonNegativeNumber(params.playbackRate, 1);
  const playerOptions: PlayerOptions = {
    loop: Boolean(params.loop),
    playbackRate,
    detune: params.detune as number,
    autostart: false,
  };
  const player = new toneModule!.Player(playerOptions);

  player.connect(gain);

  const instance: TonePlayerInstance = {
    nodeId,
    player,
    gain,
    playing: Boolean(params.playing),
    started: false,
    startedAt: 0,
    startOffsetSec: 0,
    startDurationSec: null,
    pausedOffsetSec: null,
    autostarted: false,
    lastTrigger: false,
    loading: false,
    loadingUrl: null,
    loadSeq: 0,
    loadController: null,
    ended: false,
    endedReported: false,
    manualStopPending: false,
    lastUrl: null,
    loadedUrl: null,
    failedUrl: null,
    lastClip: null,
    lastCursorSec: null,
    lastParams: { ...params, playbackRate },
  };

  player.onstop = () => {
    const inst = playerInstances.get(nodeId);
    if (!inst) return;
    if (inst.manualStopPending) {
      inst.manualStopPending = false;
      return;
    }
    if (inst.ended) return;
    if (inst.lastParams.loop) return;
    if (!inst.playing) return;

    inst.ended = true;
    inst.started = false;
    inst.startedAt = 0;

    const reverse = Boolean(inst.lastParams.reverse ?? false);
    if (
      typeof inst.startDurationSec === 'number' &&
      Number.isFinite(inst.startDurationSec) &&
      inst.startDurationSec >= 0
    ) {
      const endPos = reverse
        ? inst.startOffsetSec - inst.startDurationSec
        : inst.startOffsetSec + inst.startDurationSec;
      inst.pausedOffsetSec = Number.isFinite(endPos) ? Math.max(0, endPos) : inst.pausedOffsetSec;
    }

    inst.startOffsetSec = 0;
    inst.startDurationSec = null;
  };

  playerInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

// Audio analysis tap for patch audio connections (rms/peak/bands/centroid/bpm).
const AUDIO_DATA_FFT_SIZES = [512, 1024, 2048, 4096, 8192] as const;

export function normalizeAudioDataConfig(
  config: Record<string, unknown>
): AudioDataInstance['lastConfig'] {
  const enabled = toBoolean(config.enabled, true);
  const requestedFftSize = toNumber(config.fftSize, 2048);
  const fftSize = (() => {
    let best: number = AUDIO_DATA_FFT_SIZES[0];
    let bestDiff = Math.abs(best - requestedFftSize);
    for (const size of AUDIO_DATA_FFT_SIZES) {
      const diff = Math.abs(size - requestedFftSize);
      if (diff < bestDiff) {
        best = size;
        bestDiff = diff;
      }
    }
    return best;
  })();
  const smoothing = clamp(toNumber(config.smoothing, 0.2), 0, 0.99);
  const lowRaw = clamp(toNumber(config.lowCutoffHz, 300), 20, 20000);
  const highRaw = clamp(toNumber(config.highCutoffHz, 3000), 20, 20000);
  const lowCutoffHz = Math.min(lowRaw, highRaw);
  const highCutoffHz = Math.max(lowRaw, highRaw);
  const detectBPM = toBoolean(config.detectBPM, true);
  return { enabled, fftSize, smoothing, lowCutoffHz, highCutoffHz, detectBPM };
}

export function createAudioDataInstance(
  nodeId: string,
  config: AudioDataInstance['lastConfig']
): AudioDataInstance | null {
  if (!toneModule) return null;
  const raw: AudioContext | null = getToneRawContext(toneModule);
  if (!raw) return null;

  const input = new toneModule.Gain({ gain: 1 });
  const output = new toneModule.Gain({ gain: 1 });
  input.connect(output);

  const analyser = raw.createAnalyser();
  analyser.fftSize = config.fftSize;
  analyser.smoothingTimeConstant = config.smoothing;
  try {
    input.connect?.(analyser as AudioNode);
  } catch {
    // ignore
  }

  const instance: AudioDataInstance = {
    nodeId,
    input,
    output,
    analyser,
    timeData: new Float32Array(analyser.fftSize) as unknown as Float32Array<ArrayBuffer>,
    freqData: new Uint8Array(analyser.frequencyBinCount),
    energyHistory: [],
    lastBeatAt: 0,
    beatIntervals: [],
    bpm: 0,
    lastConfig: { ...config },
  };

  audioDataInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

export function updateAudioDataInstance(
  instance: AudioDataInstance,
  config: AudioDataInstance['lastConfig']
): void {
  const prev = instance.lastConfig;
  instance.lastConfig = { ...config };

  if (prev.fftSize !== config.fftSize) {
    try {
      instance.analyser.fftSize = config.fftSize;
      instance.timeData = new Float32Array(instance.analyser.fftSize) as unknown as Float32Array<ArrayBuffer>;
      instance.freqData = new Uint8Array(instance.analyser.frequencyBinCount);
    } catch {
      // ignore
    }
  }

  if (prev.smoothing !== config.smoothing) {
    try {
      instance.analyser.smoothingTimeConstant = config.smoothing;
    } catch {
      // ignore
    }
  }

  if (prev.detectBPM !== config.detectBPM || (!prev.enabled && config.enabled)) {
    instance.energyHistory = [];
    instance.beatIntervals = [];
    instance.lastBeatAt = 0;
    instance.bpm = 0;
  }

  if (!config.enabled) {
    instance.energyHistory = [];
    instance.beatIntervals = [];
    instance.lastBeatAt = 0;
    instance.bpm = 0;
  }
}

export function analyzeAudioDataInstance(
  instance: AudioDataInstance,
  nowMs: number
): {
  rms: number;
  peak: number;
  low: number;
  mid: number;
  high: number;
  centroidHz: number;
  bpm: number;
  beat: boolean;
} {
  let rms = 0;
  let peak = 0;

  try {
    instance.analyser.getFloatTimeDomainData(instance.timeData);
    let sumSquares = 0;
    for (let i = 0; i < instance.timeData.length; i += 1) {
      const v = instance.timeData[i] ?? 0;
      sumSquares += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    rms = instance.timeData.length > 0 ? Math.sqrt(sumSquares / instance.timeData.length) : 0;
  } catch {
    // ignore
  }

  let low = 0;
  let mid = 0;
  let high = 0;
  let centroidHz = 0;

  try {
    instance.analyser.getByteFrequencyData(instance.freqData);
    const binCount = instance.freqData.length;
    const sampleRate = instance.analyser.context?.sampleRate ?? 44100;
    const nyquist = sampleRate / 2;
    const binWidth = binCount > 0 ? nyquist / binCount : 0;

    const lowBinEnd = binWidth > 0 ? Math.floor(instance.lastConfig.lowCutoffHz / binWidth) : 0;
    const highBinStart =
      binWidth > 0 ? Math.floor(instance.lastConfig.highCutoffHz / binWidth) : binCount;

    const lowEnd = Math.max(0, Math.min(binCount, lowBinEnd));
    const highStart = Math.max(0, Math.min(binCount, highBinStart));

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    let lowCount = 0;
    let midCount = 0;
    let highCount = 0;

    let weightedSum = 0;
    let totalMag = 0;

    for (let i = 0; i < binCount; i += 1) {
      const mag = (instance.freqData[i] ?? 0) / 255;
      const freq = i * binWidth;
      weightedSum += freq * mag;
      totalMag += mag;

      if (i < lowEnd) {
        lowSum += mag;
        lowCount += 1;
      } else if (i >= highStart) {
        highSum += mag;
        highCount += 1;
      } else {
        midSum += mag;
        midCount += 1;
      }
    }

    low = lowCount > 0 ? lowSum / lowCount : 0;
    mid = midCount > 0 ? midSum / midCount : 0;
    high = highCount > 0 ? highSum / highCount : 0;
    centroidHz = totalMag > 0 ? weightedSum / totalMag : 0;
  } catch {
    // ignore
  }

  let beat = false;
  let bpm = instance.lastConfig.detectBPM ? instance.bpm : 0;

  if (instance.lastConfig.enabled && instance.lastConfig.detectBPM) {
    const windowMs = 1000;
    instance.energyHistory.push({ t: nowMs, e: low });
    while (instance.energyHistory.length > 0 && instance.energyHistory[0]!.t < nowMs - windowMs) {
      instance.energyHistory.shift();
    }

    if (instance.energyHistory.length >= 10) {
      const avg =
        instance.energyHistory.reduce((sum, item) => sum + item.e, 0) / instance.energyHistory.length;
      const variance =
        instance.energyHistory.reduce((sum, item) => sum + (item.e - avg) ** 2, 0) /
        instance.energyHistory.length;
      const std = Math.sqrt(variance);

      const threshold = avg + 1.3 * std;
      const minBeatInterval = 250; // Max 240 BPM.

      if (low > threshold && nowMs - instance.lastBeatAt > minBeatInterval) {
        beat = true;
        const interval = instance.lastBeatAt > 0 ? nowMs - instance.lastBeatAt : 0;
        instance.lastBeatAt = nowMs;

        if (interval > 0 && interval < 2000) {
          instance.beatIntervals.push(interval);
          if (instance.beatIntervals.length > 8) instance.beatIntervals.shift();

          if (instance.beatIntervals.length >= 3) {
            const avgInterval =
              instance.beatIntervals.reduce((sum, v) => sum + v, 0) / instance.beatIntervals.length;
            let nextBpm = Math.round(60000 / avgInterval);
            if (nextBpm < 60) nextBpm *= 2;
            if (nextBpm > 180) nextBpm = Math.round(nextBpm / 2);
            instance.bpm = nextBpm;
          }
        }
      }
    }

    bpm = instance.bpm;
  }

  return { rms, peak, low, mid, high, centroidHz, bpm, beat };
}

export function disposeOscInstance(nodeId: string): void {
  const inst = oscInstances.get(nodeId);
  if (!inst) return;
  disposeLoop(inst);
  try {
    inst.osc?.stop();
  } catch {
    // ignore
  }
  try {
    inst.osc?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  oscInstances.delete(nodeId);
  maybeStopTransport();
}

export function disposeEffectInstance(nodeId: string): void {
  const inst = effectInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.wrapper.dispose();
  } catch {
    // ignore
  }
  effectInstances.delete(nodeId);
}

export function disposeGranularInstance(nodeId: string): void {
  const inst = granularInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.player?.stop();
  } catch {
    // ignore
  }
  try {
    inst.player?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  granularInstances.delete(nodeId);
}

export function disposePlayerInstance(nodeId: string): void {
  const inst = playerInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.loadController?.abort();
  } catch {
    // ignore
  }
  inst.loadController = null;
  try {
    inst.manualStopPending = true;
    inst.player?.stop();
  } catch {
    inst.manualStopPending = false;
  }
  try {
    inst.player?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  playerInstances.delete(nodeId);
}

export function disposeToneLfoInstance(nodeId: string): void {
  const inst = lfoInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.lfo?.stop();
  } catch {
    // ignore
  }
  try {
    inst.lfo?.dispose();
  } catch {
    // ignore
  }
  lfoInstances.delete(nodeId);
  scheduleGraphWiring();
}

export function disposeAudioDataInstance(nodeId: string): void {
  const inst = audioDataInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.output?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.input?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.analyser?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.output?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.input?.dispose();
  } catch {
    // ignore
  }
  audioDataInstances.delete(nodeId);
  scheduleGraphWiring();
}

export function disposeNodeById(nodeId: string): void {
  disposeOscInstance(nodeId);
  disposeAudioDataInstance(nodeId);
  disposeEffectInstance(nodeId);
  disposeGranularInstance(nodeId);
  disposePlayerInstance(nodeId);
  disposeToneLfoInstance(nodeId);
  scheduleGraphWiring();
}
