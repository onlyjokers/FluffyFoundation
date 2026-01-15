// Purpose: Parse override payloads for the node executor.

export type NodeExecutorOverride = {
  nodeId: string;
  key: string;
  kind: 'config' | 'input';
  value: unknown;
  ttlMs?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const extractOverrides = (payload: unknown): NodeExecutorOverride[] => {
  if (!isRecord(payload)) return [];
  const overrides = payload.overrides;
  if (!Array.isArray(overrides)) return [];

  const results: NodeExecutorOverride[] = [];
  for (const item of overrides) {
    if (!isRecord(item)) continue;
    const nodeId = typeof item.nodeId === 'string' ? item.nodeId : '';
    const key =
      typeof item.portId === 'string'
        ? item.portId
        : typeof item.key === 'string'
          ? item.key
          : '';
    if (!nodeId || !key) continue;
    const kind = item.kind === 'config' ? 'config' : 'input';
    const ttlMs =
      typeof item.ttlMs === 'number' && Number.isFinite(item.ttlMs) ? item.ttlMs : undefined;
    if (ttlMs === undefined) {
      results.push({ nodeId, key, kind, value: item.value });
      continue;
    }
    results.push({ nodeId, key, kind, value: item.value, ttlMs });
  }

  return results;
};
