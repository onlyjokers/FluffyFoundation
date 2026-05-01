import { writable } from 'svelte/store';

export type GroupModelDistribution = Record<string, string[]>;

const STORAGE_KEY = 'shugu-root-model-distribution-v1';

function readStorage(): GroupModelDistribution {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    const next: GroupModelDistribution = {};
    for (const [groupId, idsRaw] of Object.entries(record)) {
      const ids = Array.isArray(idsRaw)
        ? idsRaw
            .map(String)
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
      if (ids.length > 0) next[String(groupId)] = Array.from(new Set(ids));
    }
    return next;
  } catch {
    return {};
  }
}

function writeStorage(value: GroupModelDistribution): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

const store = writable<GroupModelDistribution>(readStorage());

store.subscribe((value) => {
  writeStorage(value);
});

export const modelDistributionStore = {
  subscribe: store.subscribe,
  setGroupModels: (groupId: string, assetIds: string[]) => {
    const id = String(groupId ?? '').trim();
    if (!id) return;
    const ids = (assetIds ?? [])
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
    store.update((prev) => {
      const next = { ...prev };
      if (ids.length === 0) {
        delete next[id];
        return next;
      }
      next[id] = Array.from(new Set(ids));
      return next;
    });
  },
  clearGroup: (groupId: string) => {
    const id = String(groupId ?? '').trim();
    if (!id) return;
    store.update((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, id)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  },
};
