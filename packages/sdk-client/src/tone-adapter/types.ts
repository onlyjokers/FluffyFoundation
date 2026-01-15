/**
 * Purpose: Shared types for the Tone adapter implementation (internal module split).
 */

import type { Connection, NodeInstance } from '@shugu/node-core';
import type { ClientSDK } from '../client-sdk.js';

export type ToneModule = typeof import('tone');

export type LoopEvent = {
  time: number;
  frequency?: number;
  amplitude?: number;
};

export type ParsedLoop = {
  events: LoopEvent[];
  loopLengthSeconds: number;
  startAtServerTimeMs?: number;
};

export type ToneAdapterDeps = {
  sdk?: ClientSDK;
  resolveAssetRef?: (ref: string) => string;
  /**
   * Optional priority fetch function from MultimediaCore.
   * If provided, audio loading will use this to check cache and prioritize downloads.
   */
  prioritizeFetch?: (url: string) => Promise<Response>;
};

export type ToneAdapterHandle = {
  disposeNode: (nodeId: string) => void;
  disposeAll: () => void;
  syncActiveNodes: (
    activeNodeIds: Set<string>,
    nodes: NodeInstance[],
    connections: Connection[]
  ) => void;
};

export type TransportStartState = {
  started: boolean;
  scheduledAtMs: number | null;
  cancel?: () => void;
};

export type ToneParamLike = {
  value?: number;
  rampTo?: (value: number, seconds: number) => void;
  setValueAtTime?: (value: number, time: number) => void;
  linearRampToValueAtTime?: (value: number, time: number) => void;
  cancelScheduledValues?: (time: number) => void;
};

export type ToneConnectable = {
  connect?: (destination: unknown) => void;
  disconnect?: (...args: unknown[]) => void;
};

export type ToneGainLike = ToneConnectable & {
  gain?: ToneParamLike;
  toDestination?: () => ToneGainLike;
};

export type ToneOscillatorLike = ToneConnectable & {
  frequency?: ToneParamLike;
  type?: string;
  start?: (...args: unknown[]) => void;
  stop?: (...args: unknown[]) => void;
  dispose?: () => void;
};

export type TonePlayerLike = ToneConnectable & {
  buffer?: AudioBuffer | null;
  loop?: boolean;
  playbackRate?: number;
  detune?: number;
  start?: (...args: unknown[]) => void;
  stop?: (...args: unknown[]) => void;
  dispose?: () => void;
  onstop?: (() => void) | null;
};

export type ToneLfoLike = ToneConnectable & {
  frequency?: ToneParamLike;
  amplitude?: ToneParamLike;
  min?: number;
  max?: number;
  type?: string;
  start?: (...args: unknown[]) => void;
  stop?: (...args: unknown[]) => void;
  dispose?: () => void;
};

export type ToneEffectLike = ToneConnectable & {
  delayTime?: ToneParamLike;
  feedback?: ToneParamLike;
  wet?: ToneParamLike;
};

export type EffectWrapper = {
  input: ToneConnectable;
  output: ToneConnectable;
  effect: ToneEffectLike;
  wetParam?: ToneParamLike;
  setWet?: (value: number) => void;
  dispose: () => void;
};

export type ToneEffectKind = 'tone-delay' | 'tone-reverb' | 'tone-pitch' | 'tone-resonator';
export type ToneNodeKind =
  | ToneEffectKind
  | 'tone-osc'
  | 'audio-data'
  | 'tone-granular'
  | 'load-audio-from-assets'
  | 'load-audio-from-local';

export type ToneEffectInstance = {
  nodeId: string;
  kind: ToneEffectKind;
  wrapper: EffectWrapper;
  lastParams: Record<string, number | string | boolean | null>;
  pendingGenerate?: boolean;
};

export type ToneOscInstance = {
  osc: ToneOscillatorLike;
  gain: ToneGainLike;
  loop: ToneConnectable | null;
  loopKey: string | null;
  loopDefaults: { frequency: number; amplitude: number } | null;
  lastFrequency: number | null;
  lastAmplitude: number | null;
  lastWaveform: string | null;
  lastLoopLength: number | null;
};

export type ToneGranularInstance = {
  nodeId: string;
  player: TonePlayerLike;
  gain: ToneGainLike;
  playing: boolean;
  lastUrl: string | null;
  lastParams: Record<string, number | string | boolean | null>;
};

export type TonePlayerInstance = {
  nodeId: string;
  player: TonePlayerLike;
  gain: ToneGainLike;
  playing: boolean;
  started: boolean;
  startedAt: number;
  startOffsetSec: number;
  startDurationSec: number | null;
  pausedOffsetSec: number | null;
  autostarted: boolean;
  lastTrigger: boolean;
  loading: boolean;
  ended: boolean;
  endedReported: boolean;
  // Set before calling `player.stop()` so `onstop` can distinguish manual stops from natural ends.
  manualStopPending: boolean;
  // Latest desired URL for this player (resolved asset URL). Used to detect config changes.
  lastUrl: string | null;
  // URL that `player.buffer` currently corresponds to (when known).
  loadedUrl: string | null;
  // URL that most recently failed to load (avoid retrying every tick).
  failedUrl: string | null;
  // Async loading state for the *current* load attempt. See `requestTonePlayerLoad`.
  loadSeq: number;
  loadController: AbortController | null;
  loadingUrl: string | null;
  lastClip: { startSec: number; endSec: number; loop: boolean; reverse: boolean } | null;
  lastCursorSec: number | null;
  lastParams: Record<string, number | string | boolean | null>;
};

export type ToneLfoInstance = {
  nodeId: string;
  lfo: ToneLfoLike;
  started: boolean;
  lastParams: Record<string, number | string | boolean | null>;
};

export type AudioDataInstance = {
  nodeId: string;
  input: ToneConnectable;
  output: ToneConnectable;
  analyser: AnalyserNode;
  timeData: Float32Array<ArrayBuffer>;
  freqData: Uint8Array;
  energyHistory: { t: number; e: number }[];
  lastBeatAt: number;
  beatIntervals: number[];
  bpm: number;
  lastConfig: {
    enabled: boolean;
    fftSize: number;
    smoothing: number;
    lowCutoffHz: number;
    highCutoffHz: number;
    detectBPM: boolean;
  };
};
