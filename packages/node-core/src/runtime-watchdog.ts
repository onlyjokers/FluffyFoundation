/**
 * Purpose: Watchdog and command-diff helpers for NodeRuntime.
 */
import type { NodeRuntimeWatchdogInfo } from './runtime.js';

type OscillationOptions = {
  enabled: boolean;
  windowSize: number;
  minAlternatingLength: number;
  windowMs: number;
};

type SinkSignatureEntry = {
  at: number;
  signature: string;
};

export type CommandArrayDiffMetadata = {
  currentActions: string[];
  removedActions: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export const countSinkValues = (value: unknown): number => {
  if (value === undefined || value === null) return 0;
  if (Array.isArray(value)) return value.length;
  return 1;
};

export const commandSignature = (value: unknown): string | null => {
  // Actions that are expected to be continuously updated (e.g., visual effects with
  // numeric parameters) should be excluded from oscillation detection. These commands
  // naturally change frequently when the user adjusts sliders/knobs.
  const continuousActions = new Set([
    'visualScenes',
    'visualEffects',
    'screenColor',
    'modulateSoundUpdate',
  ]);

  const signatureFor = (value: unknown): string | null => {
    const cmd = asRecord(value);
    if (!cmd) return null;
    const action = typeof cmd.action === 'string' ? cmd.action : '';
    if (!action) return null;

    // `__commandRemoved` is an internal diff marker, not a command that reaches endpoints.
    // Rate-limited pulse commands naturally produce add/remove diffs between sends.
    if (action === '__commandRemoved') return null;

    // Skip oscillation detection for continuous/smoothly-updating actions.
    if (continuousActions.has(action)) return null;

    const payload = asRecord(cmd.payload) ?? {};

    const parts: string[] = [`a=${action}`];
    if (typeof payload.mode === 'string' && payload.mode) parts.push(`mode=${payload.mode}`);
    if (typeof payload.waveform === 'string' && payload.waveform)
      parts.push(`wave=${payload.waveform}`);
    if (typeof payload.sceneId === 'string' && payload.sceneId)
      parts.push(`scene=${payload.sceneId}`);
    if (typeof payload.transition === 'string' && payload.transition)
      parts.push(`trans=${payload.transition}`);

    if (action === 'flashlight' && payload.mode === 'blink') {
      const q = (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
      const freq = q(payload.frequency);
      const duty = q(payload.dutyCycle);
      if (freq !== undefined) parts.push(`f=${freq}`);
      if (duty !== undefined) parts.push(`d=${duty}`);
    }

    return parts.join(',');
  };

  if (Array.isArray(value)) {
    const items = value as unknown[];
    const sigs = items
      .slice(0, 3)
      .map((v) => signatureFor(v))
      .filter(Boolean) as string[];
    if (sigs.length === 0) return null;
    const extra = items.length > 3 ? `+${items.length - 3}` : '';
    return `arr(${sigs.join('|')})${extra}`;
  }

  return signatureFor(value);
};

export const recordSinkSignature = (
  historyByKey: Map<string, SinkSignatureEntry[]>,
  oscillation: OscillationOptions,
  key: string,
  signature: string,
  now: number
): NodeRuntimeWatchdogInfo | null => {
  const history = historyByKey.get(key) ?? [];
  const next = [...history, { at: now, signature }].slice(-oscillation.windowSize);
  historyByKey.set(key, next);

  if (!oscillation.enabled) return null;
  if (next.length < oscillation.minAlternatingLength) return null;

  const isAlternating = (slice: SinkSignatureEntry[]) => {
    const uniq = new Set(slice.map((e) => e.signature));
    if (uniq.size !== 2) return false;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i].signature === slice[i - 1].signature) return false;
    }
    for (let i = 2; i < slice.length; i++) {
      if (slice[i].signature !== slice[i - 2].signature) return false;
    }
    const span = slice[slice.length - 1].at - slice[0].at;
    return span >= 0 && span <= oscillation.windowMs;
  };

  for (let len = next.length; len >= oscillation.minAlternatingLength; len--) {
    const slice = next.slice(-len);
    if (!isAlternating(slice)) continue;
    const a = slice[0]?.signature ?? '';
    const b = slice[1]?.signature ?? '';
    return {
      reason: 'oscillation',
      message: `oscillation detected (${len} alternating changes)`,
      diagnostics: { key, a, b, length: len, windowMs: oscillation.windowMs },
    };
  }

  return null;
};

export const commandActionsFromValue = (value: unknown): string[] => {
  const out: string[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = asRecord(item);
    const action = typeof record?.action === 'string' ? record.action : '';
    if (action && action !== '__commandRemoved' && !out.includes(action)) out.push(action);
  };
  visit(value);
  return out;
};

export const getCommandArrayDiffMetadata = (value: unknown): CommandArrayDiffMetadata | null =>
  value && typeof value === 'object'
    ? (((value as { __commandArrayDiff?: CommandArrayDiffMetadata }).__commandArrayDiff ??
        null) as CommandArrayDiffMetadata | null)
    : null;

export const diffCommandArray = (prev: unknown[], next: unknown[]): unknown[] => {
  const missingCommandMarker = (action: string) => ({
    action: '__commandRemoved',
    payload: { action },
  });

  const signatureOf = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `str:${value}`;
    if (typeof value === 'number')
      return Number.isFinite(value) ? `num:${value}` : `num:${String(value)}`;
    if (typeof value === 'boolean') return `bool:${value}`;
    try {
      return `json:${JSON.stringify(value)}`;
    } catch {
      return `obj:${Object.prototype.toString.call(value)}`;
    }
  };

  const keyFor = (value: unknown, counts: Map<string, number>): string => {
    const record = asRecord(value);
    const action = typeof record?.action === 'string' ? String(record.action) : '';
    if (!action) return '';
    const idx = counts.get(action) ?? 0;
    counts.set(action, idx + 1);
    return `${action}#${idx}`;
  };

  const prevSignatures = new Map<string, string>();
  const prevCounts = new Map<string, number>();
  for (const cmd of prev) {
    const key = keyFor(cmd, prevCounts);
    if (!key) continue;
    prevSignatures.set(key, signatureOf(cmd));
  }

  const changed: unknown[] = [];
  const nextCounts = new Map<string, number>();
  const nextKeys = new Set<string>();
  for (const cmd of next) {
    const key = keyFor(cmd, nextCounts);
    // If we can't key this command, treat it as changed (best-effort safety).
    if (!key) {
      changed.push(cmd);
      continue;
    }
    nextKeys.add(key);
    const sig = signatureOf(cmd);
    if (prevSignatures.get(key) !== sig) changed.push(cmd);
  }

  const removedActions: string[] = [];
  for (const key of prevSignatures.keys()) {
    if (nextKeys.has(key)) continue;
    const [action] = key.split('#');
    if (action) {
      removedActions.push(action);
      changed.push(missingCommandMarker(action));
    }
  }

  Object.defineProperty(changed, '__commandArrayDiff', {
    value: {
      currentActions: commandActionsFromValue(next),
      removedActions,
    } satisfies CommandArrayDiffMetadata,
    enumerable: false,
  });

  return changed;
};
