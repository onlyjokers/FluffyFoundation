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
import { getControlPlaneOwnership } from '$lib/stores/manager-state-guards';
import { modelDistributionStore } from '$lib/stores/model-distribution';
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

  const incomingByTarget = new Map<string, { sourceNodeId: string; sourcePortId: string; targetPortId: string }[]>();
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
  const audioOutRoots = nodes.filter((n) => n.type === 'audio-out').map((n) => String(n.id)).sort();
  const clientRoots = nodes.filter((n) => n.type === 'client-object').map((n) => String(n.id)).sort();
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

  sdk.sendPluginControl(targetClients(ids), PLUGIN_ID, 'configure', {
    manifestId: manifest.manifestId,
    assets: manifest.assets,
    updatedAt: manifest.updatedAt,
  });

  for (const id of ids) sentManifestIdByClient.set(id, manifest.manifestId);
}

let latestDisplayManifest: AssetManifest | null = null;
let latestManifestByClientId = new Map<string, AssetManifest>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastGraphSnapshot: GraphState | null = null;
let lastAllAssetRecords: { id: string; kind: 'audio' | 'image' | 'video' | 'model' }[] = [];
let lastModelDistribution: Record<string, string[]> = {};

function recomputeAndMaybePush(): void {
  const graph = lastGraphSnapshot;
  if (!graph) return;

  const kindByAssetId = new Map(lastAllAssetRecords.map((r) => [String(r.id), r.kind] as const));
  const assetIdFromRef = (ref: string): string | null => {
    const normalized = normalizeAssetRef(ref);
    if (!normalized) return null;
    const id = normalized.slice('asset:'.length).trim();
    return id ? id : null;
  };

  const allGraphAssetRefs = scanGraphForAssetRefs(graph);
  const graphAssets = allGraphAssetRefs.filter((ref) => {
    const id = assetIdFromRef(ref);
    if (!id) return true;
    return kindByAssetId.get(id) !== 'model';
  });
  const seen = new Set(graphAssets);

  const PRIORITY_ORDER: Record<(typeof lastAllAssetRecords)[number]['kind'], number> = {
    audio: 0,
    image: 1,
    video: 2,
    model: 3,
  };
  const sortedRecords = [...lastAllAssetRecords]
    .filter((r) => r.kind !== 'model')
    .sort((a, b) => {
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

  const displayManifestId = hashManifest(allAssets);
  const displayManifest: AssetManifest = {
    manifestId: displayManifestId,
    assets: allAssets,
    updatedAt: Date.now(),
  };

  if (!latestDisplayManifest || latestDisplayManifest.manifestId !== displayManifest.manifestId) {
    latestDisplayManifest = displayManifest;
    setLatestManifest(displayManifest);
  }

  const clients = (get(managerState).clients ?? []).map((c) => String(c.clientId)).filter(Boolean);
  const connected = new Set(clients);

  const ownerStackByGroupId = getControlPlaneOwnership(get(managerState));

  const modelRefsByClientId = new Map<string, Set<string>>();
  for (const [groupId, modelIds] of Object.entries(lastModelDistribution ?? {})) {
    const ownership = ownerStackByGroupId[String(groupId)] as { ownerStack?: unknown } | undefined;
    const ownerStackRaw = ownership?.ownerStack;
    const ownerStack = Array.isArray(ownerStackRaw)
      ? ownerStackRaw.map(String).filter(Boolean)
      : [];
    const currentOwner = ownerStack.length > 0 ? ownerStack[ownerStack.length - 1] : '';
    if (!currentOwner || !connected.has(currentOwner)) continue;

    const bucket = modelRefsByClientId.get(currentOwner) ?? new Set<string>();
    for (const modelId of modelIds ?? []) {
      const id = String(modelId ?? '').trim();
      if (!id) continue;
      bucket.add(`asset:${id}`);
    }
    modelRefsByClientId.set(currentOwner, bucket);
  }

  const nextManifestByClientId = new Map<string, AssetManifest>();
  const now = Date.now();
  for (const clientId of clients) {
    const modelRefs = Array.from(modelRefsByClientId.get(clientId) ?? []).sort();
    const assets = (() => {
      if (modelRefs.length === 0) return allAssets;
      const out: string[] = [...allAssets];
      const localSeen = new Set(out);
      for (const ref of modelRefs) {
        if (localSeen.has(ref)) continue;
        localSeen.add(ref);
        out.push(ref);
      }
      return out;
    })();

    const manifestId = hashManifest(assets);
    nextManifestByClientId.set(clientId, { manifestId, assets, updatedAt: now });
  }

  latestManifestByClientId = nextManifestByClientId;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;

    const pending = clients.filter((id) => {
      const desired = latestManifestByClientId.get(id);
      if (!desired) return false;
      return sentManifestIdByClient.get(id) !== desired.manifestId;
    });
    if (pending.length === 0) return;

    const groups = new Map<string, { manifest: AssetManifest; clientIds: string[] }>();
    for (const id of pending) {
      const manifest = latestManifestByClientId.get(id);
      if (!manifest) continue;
      const entry = groups.get(manifest.manifestId) ?? { manifest, clientIds: [] };
      entry.clientIds.push(id);
      groups.set(manifest.manifestId, entry);
    }

    for (const { clientIds, manifest } of groups.values()) {
      pushManifestToClientIds(clientIds, manifest);
    }
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

modelDistributionStore.subscribe((mapping) => {
  lastModelDistribution = (mapping ?? {}) as Record<string, string[]>;
  recomputeAndMaybePush();
});

// Push manifest to clients that join after the last graph update.
managerState.subscribe(($state) => {
  recomputeAndMaybePush();
  const ids = ($state.clients ?? []).map((c) => String(c.clientId)).filter(Boolean);
  if (ids.length === 0) return;
  const pending = ids.filter((id) => {
    const desired = latestManifestByClientId.get(id);
    if (!desired) return false;
    return sentManifestIdByClient.get(id) !== desired.manifestId;
  });
  if (pending.length === 0) return;

  const groups = new Map<string, { manifest: AssetManifest; clientIds: string[] }>();
  for (const id of pending) {
    const manifest = latestManifestByClientId.get(id);
    if (!manifest) continue;
    const entry = groups.get(manifest.manifestId) ?? { manifest, clientIds: [] };
    entry.clientIds.push(id);
    groups.set(manifest.manifestId, entry);
  }
  for (const { clientIds, manifest } of groups.values()) {
    pushManifestToClientIds(clientIds, manifest);
  }
});
