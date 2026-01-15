// Purpose: Guard helpers for Tone adapter data.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

export const unwrapDefaultExport = <T>(value: T): T => {
  if (isRecord(value) && 'default' in value) {
    const maybeDefault = value.default;
    return (maybeDefault as T) ?? value;
  }
  return value;
};

export const getToneRawContext = (tone: unknown): AudioContext | null => {
  if (!isRecord(tone)) return null;
  const getContext = tone.getContext;
  if (typeof getContext !== 'function') return null;
  try {
    const ctx = (getContext as () => { rawContext?: AudioContext | null })();
    if (ctx && typeof ctx === 'object' && 'rawContext' in ctx) {
      return ctx.rawContext ?? null;
    }
  } catch {
    return null;
  }
  return null;
};
