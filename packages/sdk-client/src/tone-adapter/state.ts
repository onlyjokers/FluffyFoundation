/**
 * Purpose: Shared singleton state/constants for the Tone adapter runtime.
 *
 * The Tone adapter is effectively a client-side audio engine host; it owns long-lived
 * Tone.js node instances and maintains a snapshot of the currently deployed audio graph.
 */

import type { Connection, NodeInstance } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type {
  AudioDataInstance,
  ToneAdapterDeps,
  ToneEffectInstance,
  ToneGainLike,
  ToneGranularInstance,
  ToneLfoInstance,
  ToneModule,
  ToneNodeKind,
  ToneOscInstance,
  TonePlayerInstance,
  TransportStartState,
} from './types.js';

export const DEFAULT_RAMP_SECONDS = 0.05;
export const MIN_TONE_DELAY_TIME_SECONDS = 0.001;
export const FIXED_TONE_REVERB_PREDELAY_SECONDS = 0.01;
export const FIXED_TONE_RESONATOR_DELAY_SECONDS = 0.08;
export const FIXED_TONE_PITCH_DELAY_SECONDS = 0;
export const FIXED_TONE_PITCH_FEEDBACK = 0;
export const FIXED_TONE_PITCH_WET = 1;
export const DEFAULT_STEP_SECONDS = 0.25;

export const AUDIO_NODE_KINDS = new Set<ToneNodeKind>([
  'tone-osc',
  'audio-data',
  'tone-delay',
  'tone-resonator',
  'tone-pitch',
  'tone-reverb',
  'tone-granular',
  'load-audio-from-assets',
  'load-audio-from-local',
]);

export const AUDIO_INPUT_PORTS = new Map<ToneNodeKind, string[]>([
  ['audio-data', ['in']],
  ['tone-delay', ['in']],
  ['tone-resonator', ['in']],
  ['tone-pitch', ['in']],
  ['tone-reverb', ['in']],
]);

export const AUDIO_OUTPUT_PORTS = new Map<ToneNodeKind, string[]>([
  ['tone-osc', ['value']],
  ['audio-data', ['out']],
  ['tone-delay', ['out']],
  ['tone-resonator', ['out']],
  ['tone-pitch', ['out']],
  ['tone-reverb', ['out']],
  ['tone-granular', ['value']],
  ['load-audio-from-assets', ['ref']],
  ['load-audio-from-local', ['ref']],
]);

export let toneModule: ToneModule | null = null;
export let masterGain: ToneGainLike | null = null;
export const transportState: TransportStartState = { started: false, scheduledAtMs: null };

export const oscInstances = new Map<string, ToneOscInstance>();
export const effectInstances = new Map<string, ToneEffectInstance>();
export const granularInstances = new Map<string, ToneGranularInstance>();
export const playerInstances = new Map<string, TonePlayerInstance>();
export const lfoInstances = new Map<string, ToneLfoInstance>();
export const audioDataInstances = new Map<string, AudioDataInstance>();

export const latestGraphNodesById = new Map<string, NodeInstance>();
export const latestAudioConnections: Connection[] = [];
export const latestToneLfoConnections: Connection[] = [];
export const latestToneLfoDesiredTargets = new Set<string>();
export const latestToneLfoActiveTargets = new Set<string>();

// Store deps for access by standalone functions (e.g., startTonePlayerLoad).
export const latestDeps: ToneAdapterDeps = {};

export function setLatestDeps(deps: ToneAdapterDeps): void {
  for (const key of Object.keys(latestDeps) as Array<keyof ToneAdapterDeps>) {
    delete latestDeps[key];
  }
  Object.assign(latestDeps, deps);
}

export async function ensureTone(): Promise<ToneModule> {
  if (toneModule) return toneModule;
  const tone = (await toneAudioEngine.ensureLoaded()) as unknown as ToneModule;
  toneModule = (toneAudioEngine.getToneModule() as unknown as ToneModule | null) ?? tone;
  return tone;
}

export function ensureMasterGain(): void {
  if (!toneModule || masterGain) return;
  const gain = new toneModule.Gain({ gain: 1 });
  gain.connect(toneModule.Destination);
  masterGain = gain;
}
