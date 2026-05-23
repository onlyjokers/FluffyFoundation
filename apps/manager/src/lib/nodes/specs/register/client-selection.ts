/**
 * Purpose: Track graph-driven client selection state for client-loader nodes.
 */
import { get } from 'svelte/store';
import { state, selectClients } from '$lib/stores/manager';
import { coerceBoolean, isFiniteNumber } from './helpers';
import type { MidiSource } from '$lib/features/midi/midi-node-bridge';
import type { ClientSelectionState, MidiBooleanState } from './types';

// Track MIDI boolean toggles per node (edge-triggered on press).
export const midiBooleanState = new Map<string, MidiBooleanState>();
// Track client selection offsets per node (index/range).
export const clientSelectionState = new Map<string, ClientSelectionState>();
// Throttle noisy per-frame logs (e.g. showImage streaming).
export const displayObjectLogLastAt = new Map<string, number>();

export function midiSourceKey(source: MidiSource | null | undefined): string | null {
  if (!source) return null;
  const input = source.inputId ? `in:${source.inputId}` : 'in:*';
  const number = source.type === 'pitchbend' ? 'pb' : String(source.number ?? 0);
  return `${input}|${source.type}|ch:${source.channel}|num:${number}`;
}

function clampInt(value: number, min: number, max: number): number {
  // For selection indices/ranges we want "reach the next integer" behavior, not `.5` rounding.
  const next = Math.floor(value);
  return Math.max(min, Math.min(max, next));
}

function selectionEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, idx) => id === b[idx]);
}

function buildAlternatingSelection(clients: string[], index: number, range: number): string[] {
  const total = clients.length;
  const picked: string[] = [];
  const seen = new Set<number>();

  const add = (pos: number) => {
    if (pos < 1 || pos > total) return;
    if (seen.has(pos)) return;
    seen.add(pos);
    picked.push(clients[pos - 1]);
  };

  add(index);
  let offset = 1;
  while (picked.length < range && (index + offset <= total || index - offset >= 1)) {
    add(index + offset);
    if (picked.length >= range) break;
    add(index - offset);
    offset += 1;
  }

  return picked;
}

function pickRandomIds(pool: string[], count: number): string[] {
  if (count <= 0) return [];
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function applyClientSelectionFromInputs(nodeId: string, inputs: Record<string, unknown>): void {
  const indexRaw = inputs.index;
  const rangeRaw = inputs.range;
  const randomRaw = inputs.random;
  const hasIndex = isFiniteNumber(indexRaw);
  const hasRange = isFiniteNumber(rangeRaw);
  const hasRandom = typeof randomRaw === 'boolean' || isFiniteNumber(randomRaw);

  if (!hasIndex && !hasRange && !hasRandom) {
    clientSelectionState.delete(nodeId);
    return;
  }

  const prev =
    clientSelectionState.get(nodeId) ??
    ({
      index: 1,
      range: 1,
      random: false,
      baseRandomIds: [],
      selectedIds: [],
      clientsKey: '',
    } as ClientSelectionState);
  const indexValue = hasIndex ? Number(indexRaw) : prev.index;
  const rangeValue = hasRange ? Number(rangeRaw) : prev.range;
  const randomValue = hasRandom ? coerceBoolean(randomRaw, prev.random) : prev.random;
  if (!Number.isFinite(indexValue) || !Number.isFinite(rangeValue)) return;

  const clients = (get(state).clients ?? []).map((c) => String(c.clientId ?? '')).filter(Boolean);
  if (clients.length === 0) return;

  const total = clients.length;
  const rangeClamped = clampInt(rangeValue, 1, total);
  const start = clampInt(indexValue, 1, total);
  let next: string[] = [];
  let baseRandomIds = prev.baseRandomIds ?? [];
  const clientsKey = clients.join('|');

  if (randomValue) {
    const prevRandom = prev.random ?? false;
    if (!prevRandom || prev.clientsKey !== clientsKey) {
      baseRandomIds = [];
    }

    baseRandomIds = baseRandomIds.filter((id) => clients.includes(id));
    if (baseRandomIds.length > rangeClamped) baseRandomIds = baseRandomIds.slice(0, rangeClamped);

    if (baseRandomIds.length < rangeClamped) {
      const remaining = clients.filter((id) => !baseRandomIds.includes(id));
      const needed = rangeClamped - baseRandomIds.length;
      baseRandomIds = [...baseRandomIds, ...pickRandomIds(remaining, needed)];
    }

    const offset = start - 1;
    const seen = new Set<string>();
    for (const baseId of baseRandomIds) {
      const pos = clients.indexOf(baseId);
      if (pos < 0) continue;
      const nextId = clients[(pos + offset) % total];
      if (!seen.has(nextId)) {
        seen.add(nextId);
        next.push(nextId);
      }
    }
  } else {
    next = buildAlternatingSelection(clients, start, rangeClamped);
  }
  const current = get(state).selectedClientIds.map(String).filter((id) => clients.includes(id));
  const inputsChanged =
    prev.index !== start ||
    prev.range !== rangeClamped ||
    prev.random !== randomValue ||
    prev.clientsKey !== clientsKey;

  let nextIndex = start;
  let nextRange = rangeClamped;
  let shouldSyncSelection = true;

  if (!inputsChanged && !selectionEqual(current, next)) {
    // Treat manual selection as the source of truth until inputs change.
    next = current;
    shouldSyncSelection = false;
    if (next.length > 0) {
      const firstId = next[0];
      const idx = clients.indexOf(firstId);
      if (idx >= 0) nextIndex = idx + 1;
      nextRange = Math.max(1, Math.min(total, next.length));
    }
  }

  if (shouldSyncSelection && !selectionEqual(current, next)) {
    selectClients(next);
  }

  clientSelectionState.set(nodeId, {
    index: nextIndex,
    range: nextRange,
    random: randomValue,
    baseRandomIds,
    selectedIds: next,
    clientsKey,
  });
}

export function getSelectedClientIndexOut(): number {
  const clients = (get(state).clients ?? []).map((c) => String(c.clientId ?? '')).filter(Boolean);
  if (clients.length === 0) return 0;
  const selected = get(state).selectedClientIds.map(String);
  const targetId = selected[0];
  if (!targetId) return 0;
  const idx = clients.indexOf(targetId);
  return idx >= 0 ? idx + 1 : 0;
}
