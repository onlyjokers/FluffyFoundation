/**
 * Purpose: Compute Display screenColor overlay state, including FF-18 GS-13 modulation sampling.
 */
import type { ScreenColorPayload } from '@shugu/protocol';

export type ScreenOverlaySample = {
  visible: boolean;
  color: string;
  opacity: number;
};

export type ScreenOverlayEffect = {
  mode: Exclude<NonNullable<ScreenColorPayload['mode']>, 'solid'>;
  startedAt: number;
  color: string;
  secondaryColor: string;
  opacity: number;
  minOpacity: number;
  maxOpacity: number;
  waveform: NonNullable<ScreenColorPayload['waveform']>;
  frequencyHz: number;
  pulseDuration: number;
  pulseMin: number;
  cycleColors: string[];
  cycleDuration: number;
};

export type ScreenOverlayState = ScreenOverlaySample & {
  effect: ScreenOverlayEffect | null;
};

const DEFAULT_COLOR = '#000000';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
  };
}

function mixColors(a: string, b: string, factor: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return factor < 0.5 ? a : b;

  const r = Math.round(ca.r + (cb.r - ca.r) * factor);
  const g = Math.round(ca.g + (cb.g - ca.g) * factor);
  const bl = Math.round(ca.b + (cb.b - ca.b) * factor);
  return `rgb(${r}, ${g}, ${bl})`;
}

function waveformValue(type: NonNullable<ScreenColorPayload['waveform']>, phase: number): number {
  const normalized = (value: number) => (value + 1) / 2;
  switch (type) {
    case 'square':
      return phase % (2 * Math.PI) < Math.PI ? 1 : 0;
    case 'triangle': {
      const t = phase % (2 * Math.PI);
      return t < Math.PI ? t / Math.PI : 1 - (t - Math.PI) / Math.PI;
    }
    case 'sawtooth':
      return (phase % (2 * Math.PI)) / (2 * Math.PI);
    case 'sine':
    default:
      return normalized(Math.sin(phase));
  }
}

export function createClearedDisplayScreenOverlayState(): ScreenOverlayState {
  return { visible: false, color: DEFAULT_COLOR, opacity: 0, effect: null };
}

export function getDisplayScreenOverlayNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

export function createDisplayScreenOverlayState(
  payload: ScreenColorPayload,
  now = getDisplayScreenOverlayNow()
): ScreenOverlayState {
  const color = typeof payload.color === 'string' && payload.color.trim() ? payload.color.trim() : DEFAULT_COLOR;
  const opacity = clamp(finiteNumber(payload.opacity, 1), 0, 1);
  const mode = payload.mode ?? 'solid';

  if (mode === 'solid') {
    return { visible: opacity > 0, color, opacity, effect: null };
  }

  const maxOpacity = clamp(finiteNumber(payload.maxOpacity, opacity), 0, 1);
  const minOpacity = clamp(finiteNumber(payload.minOpacity ?? payload.pulseMin, 0), 0, maxOpacity);
  const effect: ScreenOverlayEffect = {
    mode,
    startedAt: now,
    color,
    secondaryColor: payload.secondaryColor ?? color,
    opacity,
    minOpacity,
    maxOpacity,
    waveform: payload.waveform ?? 'sine',
    frequencyHz: Math.max(0.1, finiteNumber(payload.frequencyHz, 1)),
    pulseDuration: Math.max(300, finiteNumber(payload.pulseDuration, 1200)),
    pulseMin: clamp(finiteNumber(payload.pulseMin ?? payload.minOpacity, 0.25), 0, 1),
    cycleColors: payload.cycleColors && payload.cycleColors.length >= 2 ? payload.cycleColors : [color, payload.secondaryColor ?? color],
    cycleDuration: Math.max(600, finiteNumber(payload.cycleDuration, 4000)),
  };

  return { ...sampleDisplayScreenOverlay({ visible: true, color, opacity, effect }, now), effect };
}

export function sampleDisplayScreenOverlay(state: ScreenOverlayState, now = Date.now()): ScreenOverlaySample {
  const effect = state.effect;
  if (!effect) return { visible: state.visible, color: state.color, opacity: state.opacity };

  const elapsedMs = Math.max(0, now - effect.startedAt);
  switch (effect.mode) {
    case 'blink': {
      const period = 1000 / Math.max(0.2, finiteNumber((effect as ScreenOverlayEffect).frequencyHz, 2));
      const phase = (elapsedMs % period) / period;
      return phase < 0.5
        ? { visible: true, color: effect.color, opacity: effect.opacity }
        : { visible: false, color: effect.color, opacity: 0 };
    }
    case 'pulse': {
      const phase = (elapsedMs / 1000) * (1000 / effect.pulseDuration) * Math.PI * 2;
      const factor = waveformValue(effect.waveform, phase);
      const opacity = effect.pulseMin + (effect.maxOpacity - effect.pulseMin) * factor;
      return { visible: opacity > 0, color: mixColors(effect.color, effect.secondaryColor, factor), opacity };
    }
    case 'cycle': {
      const segment = effect.cycleDuration / effect.cycleColors.length;
      const elapsed = elapsedMs % effect.cycleDuration;
      const index = Math.floor(elapsed / segment);
      const nextIndex = (index + 1) % effect.cycleColors.length;
      const factor = (elapsed % segment) / segment;
      return {
        visible: effect.opacity > 0,
        color: mixColors(effect.cycleColors[index], effect.cycleColors[nextIndex], factor),
        opacity: effect.opacity,
      };
    }
    case 'modulate':
    default: {
      const phase = (elapsedMs / 1000) * effect.frequencyHz * Math.PI * 2;
      const factor = waveformValue(effect.waveform, phase);
      const opacity = effect.minOpacity + (effect.maxOpacity - effect.minOpacity) * factor;
      return { visible: opacity > 0, color: mixColors(effect.color, effect.secondaryColor, factor), opacity };
    }
  }
}
