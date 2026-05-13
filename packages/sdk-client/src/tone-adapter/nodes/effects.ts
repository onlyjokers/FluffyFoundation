/**
 * Purpose: Manage Tone effect node instances.
 */
import type { EffectWrapper, ToneConnectable, ToneDelayEffectLike, ToneEffectInstance, ToneEffectKind, ToneEffectLike, ToneParamLike, TonePitchEffectLike, ToneResonatorEffectLike, ToneReverbEffectLike } from '../types.js';
import { DEFAULT_RAMP_SECONDS, FIXED_TONE_PITCH_DELAY_SECONDS, FIXED_TONE_PITCH_FEEDBACK, FIXED_TONE_PITCH_WET, FIXED_TONE_RESONATOR_DELAY_SECONDS, FIXED_TONE_REVERB_PREDELAY_SECONDS, MIN_TONE_DELAY_TIME_SECONDS, effectInstances, toneModule } from '../state.js';
import { isToneLfoTargetActive, scheduleGraphWiring } from '../engine-host.js';
import { clamp, toToneDelayTimeSeconds } from '../utils.js';

function createDelayEffect(time: number, feedback: number, wet: number): EffectWrapper {
  const effect = new toneModule!.FeedbackDelay({
    delayTime: toToneDelayTimeSeconds(time, MIN_TONE_DELAY_TIME_SECONDS),
    feedback,
    wet,
  });
  const setWet = (value: number) => effect.wet.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input: effect as unknown as ToneConnectable,
    output: effect as unknown as ToneConnectable,
    effect: effect as unknown as ToneEffectLike,
    wetParam: effect.wet as unknown as ToneDelayEffectLike['wet'],
    setWet,
    dispose: () => effect.dispose(),
  };
}

function createReverbEffect(decay: number, wet: number): EffectWrapper {
  const effect = new toneModule!.Reverb({ decay, preDelay: FIXED_TONE_REVERB_PREDELAY_SECONDS, wet });
  const setWet = (value: number) => effect.wet.rampTo(value, DEFAULT_RAMP_SECONDS);
  return {
    input: effect as unknown as ToneConnectable,
    output: effect as unknown as ToneConnectable,
    effect: effect as unknown as ToneEffectLike,
    wetParam: effect.wet as unknown as ToneReverbEffectLike['wet'],
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
    input: effect as unknown as ToneConnectable,
    output: effect as unknown as ToneConnectable,
    effect: effect as unknown as ToneEffectLike,
    wetParam: effect.wet as unknown as TonePitchEffectLike['wet'],
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
    input: input as unknown as ToneConnectable,
    output: crossfade as unknown as ToneConnectable,
    effect: comb as unknown as ToneEffectLike,
    wetParam: crossfade.fade as unknown as ToneParamLike,
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
      const effect = instance.wrapper.effect as ToneDelayEffectLike;
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
      const effect = instance.wrapper.effect as ToneReverbEffectLike;
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
      const effect = instance.wrapper.effect as TonePitchEffectLike;
      const pitch = nextParams.pitch;
      const windowSize = nextParams.windowSize;
      const feedback = FIXED_TONE_PITCH_FEEDBACK;
      const wet = FIXED_TONE_PITCH_WET;
      if (instance.lastParams.pitch !== pitch) effect.pitch = pitch;
      if (instance.lastParams.windowSize !== windowSize) effect.windowSize = windowSize;
      if (instance.lastParams.feedback !== feedback) {
        effect.feedback.rampTo(feedback, DEFAULT_RAMP_SECONDS);
      }
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
      const comb = instance.wrapper.effect as ToneResonatorEffectLike;
      const resonance = clamp(nextParams.resonance, 0, 1);
      const dampening = nextParams.dampening;
      const wet = clamp(nextParams.wet, 0, 1);
      if (instance.lastParams.resonance !== resonance)
        comb.resonance.rampTo(resonance, DEFAULT_RAMP_SECONDS);
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
