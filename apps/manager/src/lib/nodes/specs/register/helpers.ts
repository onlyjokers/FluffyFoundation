/**
 * Purpose: Small shared helpers for manager node spec registration.
 */
import type { ClampSpec } from './types';

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export type AnyRecord = Record<string, unknown>;

export function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? (value as AnyRecord) : null;
}

export function clampNumber(value: number, clamp: ClampSpec | undefined): number {
  let next = value;
  const min = clamp?.min;
  const max = clamp?.max;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

export function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
  return fallback;
}
