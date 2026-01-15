// Purpose: Small guard helpers for parsing untyped payloads.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

export const getString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

export const getNumber = (value: unknown, fallback: number): number => {
  if (value == null) return fallback;
  const num = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const getBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const num = Number(normalized);
    if (Number.isFinite(num)) return num > 0;
    return fallback;
  }
  if (typeof value === 'number') return value > 0;
  return fallback;
};
