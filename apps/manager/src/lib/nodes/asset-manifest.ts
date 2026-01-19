/**
 * Purpose: Manager-side asset manifest builder + push to clients.
 *
 * - Scans the current graph for `asset:` references (stable order, first appearance wins).
 * - Debounces updates and pushes a manifest to connected clients via plugin control:
 *   `pluginId: "multimedia-core", command: "configure"`.
 *
 * Notes:
 * - This module is side-effectful by design (subscriptions) and is imported from `apps/manager/src/lib/nodes/index.ts`.
 * - It intentionally avoids storing any auth token inside the graph; tokens live in localStorage/UI config only.
 */
import { get } from 'svelte/store';
import { targetClients } from '@shugu/protocol';

import type { GraphState } from './types';
import { nodeEngine } from './engine';
import { nodeRegistry } from './registry';
import { getSDK, state as managerState } from '$lib/stores/manager';
import { assetsStore } from '$lib/stores/assets';
import {
  type AssetManifest,
  getLatestManifest,
  setLatestManifest,
  subscribeLatestManifest,
} from './asset-manifest-store';

export type { AssetManifest };
export { getLatestManifest, subscribeLatestManifest };

const MANIFEST_DEBOUNCE_MS = 250;
const PLUGIN_ID = 'multimedia-core';

const sentManifestIdByClient = new Map<string, string>();

function normalizeAssetRef(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (s.startsWith('asset:')) {
    const id = s.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}` : null;
  }

  const shuguPrefix = 'shugu://asset/';
  if (s.startsWith(shuguPrefix)) {
    const id = s.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}` : null;
  }

  return null;
}

function hashManifest(assets: string[]): string {
  // Simple deterministic hash (djb2) to avoid bundling crypto; collisions are acceptable for MVP.
  const joined = assets.join('|');
  let hash = 5381;
  for (let i = 0; i < joined.length; i += 1) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) >>> 0;
  }
  return `m1-${assets.length}-${hash.toString(16)}`;
}

function collectAssetRefs(value: unknown, out: string[], seen: Set<string>): void {
  if (typeof value === 'string') {
    const normalized = normalizeAssetRef(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, out, seen);
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const v of Object.values(value as Record<string, unknown>)) {
    collectAssetRefs(v, out, seen);
  }
}

function scanGraphForAssetRefs(graph: GraphState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const normalizeAssetPickerValue = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return normalizeAssetRef(trimmed) ?? `asset:${trimmed}`;
  };

  const nodes = (graph.nodes ?? []).slice();
  const byId = new Map(nodes.map((n) => [String(n.id), n]));

  const incomingByTarget = new Map<
    string,
    { sourceNodeId: string; sourcePortId: string; targetPortId: string }[]
  >();
  for (const c of graph.connections ?? []) {
    const targetNodeId = String(c.targetNodeId);
    const list = incomingByTarget.get(targetNodeId) ?? [];
    list.push({
      sourceNodeId: String(c.sourceNodeId),
      sourcePortId: String(c.sourcePortId),
      targetPortId: String(c.targetPortId),
    });
    incomingByTarget.set(targetNodeId, list);
  }
  for (const list of incomingByTarget.values()) {
    list.sort(
      (a, b) =>
        a.targetPortId.localeCompare(b.targetPortId) ||
        a.sourcePortId.localeCompare(b.sourcePortId) ||
        a.sourceNodeId.localeCompare(b.sourceNodeId)
    );
  }

  const shouldTraverse = (targetNodeId: string, targetPortId: string): boolean => {
    const node = byId.get(String(targetNodeId));
    if (!node) return true;
    const def = nodeRegistry.get(String(node.type));
    const port = def?.inputs?.find((p) => String(p.id) === String(targetPortId));
    const type = (port?.type ?? 'any') as string;
    // Asset preload should follow "real usage" dependencies; routing nodes (client) and command sinks are excluded.
    if (type === 'client' || type === 'command') return false;
    return true;
  };

  // Prefer a traversal rooted at sinks (Max/MSP style): start from patch roots / client routing and walk upstream.
  // Order matters for preload priority: audio-out first, then client-object, then fallback to all nodes.
  const audioOutRoots = nodes
    .filter((n) => n.type === 'audio-out')
    .map((n) => String(n.id))
    .sort();
  const clientRoots = nodes
    .filter((n) => n.type === 'client-object')
    .map((n) => String(n.id))
    .sort();
  const roots = [...audioOutRoots, ...clientRoots];
  const startIds = roots.length > 0 ? roots : nodes.map((n) => String(n.id));

  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    const id = String(nodeId);
    if (!id || visited.has(id)) return;
    visited.add(id);

    const incoming = incomingByTarget.get(id) ?? [];
    for (const c of incoming) {
      if (!shouldTraverse(id, c.targetPortId)) continue;
      visit(c.sourceNodeId);
    }

    const node = byId.get(id);
    if (!node) return;

    // Also include asset-picker config fields (they may store bare assetIds, not `asset:<id>`).
    const def = nodeRegistry.get(String(node.type));
    for (const field of def?.configSchema ?? []) {
      if (field.type !== 'asset-picker') continue;
      const key = String(field.key ?? '');
      if (!key) continue;
      const normalized = normalizeAssetPickerValue(node.config?.[key]);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    }

    collectAssetRefs(node?.config ?? null, out, seen);
    collectAssetRefs(node?.inputValues ?? null, out, seen);
  };

  for (const id of startIds) visit(id);

  return out;
}

function pushManifestToClientIds(clientIds: string[], manifest: AssetManifest): void {
  const sdk = getSDK();
  if (!sdk) return;

  const ids = clientIds.map(String).filter(Boolean);
  if (ids.length === 0) return;

  sdk.sendPluginControl(
    targetClients(ids),
    PLUGIN_ID,
    'configure',
    {
      manifestId: manifest.manifestId,
      assets: manifest.assets,
      updatedAt: manifest.updatedAt,
    },
    undefined
  );

  for (const id of ids) sentManifestIdByClient.set(id, manifest.manifestId);
}

let latestManifest: AssetManifest | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastGraphSnapshot: GraphState | null = null;
// Store asset info with kind for priority sorting: audio > image > video.
let lastAllAssetRecords: { id: string; kind: 'audio' | 'image' | 'video' }[] = [];

function recomputeAndMaybePush(): void {
  const graph = lastGraphSnapshot;
  if (!graph) return;

  // Start with assets used in the graph (priority order).
  const graphAssets = scanGraphForAssetRefs(graph);
  const seen = new Set(graphAssets);

  // Add ALL assets from the Assets Manager (so user can switch to any without delay).
  // Sort by priority: audio first, then image, then video.
  const PRIORITY_ORDER = { audio: 0, image: 1, video: 2 };
  const sortedRecords = [...lastAllAssetRecords].sort((a, b) => {
    return (PRIORITY_ORDER[a.kind] ?? 99) - (PRIORITY_ORDER[b.kind] ?? 99);
  });

  const allAssets = [...graphAssets];
  for (const { id } of sortedRecords) {
    const ref = `asset:${id}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      allAssets.push(ref);
    }
  }

  const manifestId = hashManifest(allAssets);
  const next: AssetManifest = { manifestId, assets: allAssets, updatedAt: Date.now() };

  if (latestManifest && latestManifest.manifestId === next.manifestId) return;
  latestManifest = next;
  setLatestManifest(next);

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const clients = (get(managerState).clients ?? []).map((c) => c.clientId);
    const pending = clients.filter((id) => sentManifestIdByClient.get(id) !== next.manifestId);
    pushManifestToClientIds(pending, next);
  }, MANIFEST_DEBOUNCE_MS);
}

// Keep manifest up-to-date with the graph.
nodeEngine.graphState.subscribe((graph) => {
  lastGraphSnapshot = graph;
  recomputeAndMaybePush();
});

// Keep manifest up-to-date with all available assets.
assetsStore.subscribe((state) => {
  lastAllAssetRecords = (state.assets ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
  }));
  recomputeAndMaybePush();
});

// Push manifest to clients that join after the last graph update.
managerState.subscribe(($state) => {
  if (!latestManifest) return;
  const ids = ($state.clients ?? []).map((c) => c.clientId);
  const pending = ids.filter((id) => sentManifestIdByClient.get(id) !== latestManifest?.manifestId);
  if (pending.length === 0) return;
  pushManifestToClientIds(pending, latestManifest);
});
