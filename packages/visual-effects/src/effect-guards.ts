/**
 * Purpose: Guard helpers for visual effects payloads.
 */
import type { VisualEffect } from '@shugu/protocol';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getEffectType = (effect: unknown): VisualEffect['type'] | '' => {
  if (!isRecord(effect)) return '';
  const type = effect.type;
  return type === 'ascii' || type === 'convolution' ? type : '';
};

const parseNumber = (value: unknown): number | null => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

export const getAsciiCellSize = (effect: unknown): number | null => {
  if (getEffectType(effect) !== 'ascii') return null;
  if (!isRecord(effect)) return null;
  return parseNumber(effect.cellSize);
};

export const getConvolutionScale = (effect: unknown): number | null => {
  if (getEffectType(effect) !== 'convolution') return null;
  if (!isRecord(effect)) return null;
  return parseNumber(effect.scale);
};

export const asVisualEffect = (effect: unknown): VisualEffect | null => {
  if (getEffectType(effect) === '') return null;
  return effect as VisualEffect;
};
