/**
 * Purpose: Shared audio source selection helpers for audio-reactive visual scenes.
 */
import { FCT_TRACK_AUDIO_SOURCES, type FctTrackAudioSource } from '@shugu/protocol';
import type { VisualAudioFeatures, VisualContext } from './types.js';

export type VisualAudioSource = FctTrackAudioSource;

export const isVisualAudioSource = (value: unknown): value is VisualAudioSource =>
  typeof value === 'string' && FCT_TRACK_AUDIO_SOURCES.includes(value as VisualAudioSource);

export const normalizeVisualAudioSource = (
  value: unknown,
  fallback: VisualAudioSource = 'microphone'
): VisualAudioSource => (isVisualAudioSource(value) ? value : fallback);

export const clampOpacity = (value: unknown, fallback = 0): number => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

export const backgroundWithOpacity = (color: string, opacity: number): string => {
  const alpha = clampOpacity(opacity, 0);
  if (alpha <= 0) return 'transparent';
  if (alpha >= 1) return color;
  const match = color.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return color;
  const raw = match[1]!;
  const full = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const mergeAudioFeatures = (
  first: VisualAudioFeatures | undefined,
  second: VisualAudioFeatures | undefined
): VisualAudioFeatures | undefined => {
  if (!first) return second;
  if (!second) return first;
  const avg = (a: unknown, b: unknown): number | undefined => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return (na + nb) / 2;
    if (Number.isFinite(na)) return na;
    if (Number.isFinite(nb)) return nb;
    return undefined;
  };
  const melA = Array.isArray(first.melBands) ? first.melBands : [];
  const melB = Array.isArray(second.melBands) ? second.melBands : [];
  const melBands = (() => {
    const length = Math.max(melA.length, melB.length);
    if (length === 0) return undefined;
    return Array.from({ length }, (_, index) => avg(melA[index], melB[index]) ?? -8);
  })();

  const merged: VisualAudioFeatures = {
    beatDetected: Boolean(first.beatDetected || second.beatDetected),
  };
  const rms = avg(first.rms, second.rms);
  const lowEnergy = avg(first.lowEnergy, second.lowEnergy);
  const midEnergy = avg(first.midEnergy, second.midEnergy);
  const highEnergy = avg(first.highEnergy, second.highEnergy);
  const spectralCentroid = avg(first.spectralCentroid, second.spectralCentroid);
  if (rms !== undefined) merged.rms = rms;
  if (lowEnergy !== undefined) merged.lowEnergy = lowEnergy;
  if (midEnergy !== undefined) merged.midEnergy = midEnergy;
  if (highEnergy !== undefined) merged.highEnergy = highEnergy;
  if (first.bpm !== undefined || second.bpm !== undefined) merged.bpm = first.bpm ?? second.bpm ?? null;
  if (melBands !== undefined) merged.melBands = melBands;
  if (spectralCentroid !== undefined) merged.spectralCentroid = spectralCentroid;
  return merged;
};

export function selectVisualAudioFeatures(
  context: VisualContext,
  source: VisualAudioSource
): VisualAudioFeatures | undefined {
  if (source === 'playback') return context.playbackAudioFeatures;
  if (source === 'both') {
    const merged = mergeAudioFeatures(context.microphoneAudioFeatures, context.playbackAudioFeatures);
    return merged ?? context.audioFeatures;
  }
  return context.microphoneAudioFeatures ?? context.audioFeatures;
}
