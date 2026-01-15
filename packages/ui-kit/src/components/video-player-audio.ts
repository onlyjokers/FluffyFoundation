// Purpose: Typed helpers for VideoPlayer audio and promise handling.

type AudioContextCtor = new (...args: never[]) => AudioContext;

type ToneContextLike = {
  rawContext?: AudioContext | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const unwrapDefaultExport = <T>(value: T): T => {
  if (isRecord(value) && 'default' in value) {
    const maybeDefault = value.default;
    return (maybeDefault as T) ?? value;
  }
  return value;
};

export const resolveToneRawContext = (mod: unknown): AudioContext | null => {
  if (!isRecord(mod)) return null;
  const getContext = mod.getContext;
  if (typeof getContext !== 'function') return null;
  try {
    const ctx = (getContext as () => ToneContextLike)();
    if (ctx && typeof ctx === 'object' && 'rawContext' in ctx) {
      return ctx.rawContext ?? null;
    }
  } catch {
    return null;
  }
  return null;
};

export const getAudioContextCtor = (win?: Window | null): AudioContextCtor | null => {
  if (!win) return null;
  const typed = win as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return typed.AudioContext ?? typed.webkitAudioContext ?? null;
};

export const asPromiseLike = <T = unknown>(value: unknown): PromiseLike<T> | null => {
  if (!value) return null;
  const type = typeof value;
  if (type !== 'object' && type !== 'function') return null;
  const maybe = value as { catch?: unknown };
  return typeof maybe.catch === 'function' ? (value as PromiseLike<T>) : null;
};

export const toErrorName = (err: unknown): string => {
  if (!isRecord(err)) return '';
  const name = err.name;
  return typeof name === 'string' ? name : '';
};
