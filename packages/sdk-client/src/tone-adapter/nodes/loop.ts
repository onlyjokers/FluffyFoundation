/**
 * Purpose: Parse Tone loop patterns for oscillator scheduling.
 */
import type { LoopEvent, ParsedLoop } from '../types.js';
import { DEFAULT_STEP_SECONDS } from '../state.js';
import { toNumber } from '../utils.js';

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
