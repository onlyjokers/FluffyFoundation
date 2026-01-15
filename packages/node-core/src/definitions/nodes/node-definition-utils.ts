/**
 * Purpose: Shared helpers for node definition input/config parsing.
 */
export type UnknownRecord = Record<string, unknown>;

export const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

export const getStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const trimmed = value[0].trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export const getNumberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const getBooleanValue = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

export const getArrayValue = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

export const getRecordString = (value: unknown, key: string): string | null => {
  const record = asRecord(value);
  if (!record) return null;
  return getStringValue(record[key]);
};
