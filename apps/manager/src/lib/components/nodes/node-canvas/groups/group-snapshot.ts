// Snapshot helpers for persisting NodeCanvas group UI state.
import { asRecord, getBoolean, getString } from '$lib/utils/value-guards';
import type { NodeGroup } from '../controllers/group-controller';

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value);
}

export function groupSnapshotKey(groups: NodeGroup[]): string {
  const sorted = Array.isArray(groups)
    ? [...groups].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
    : [];
  return sorted
    .map((g) => {
      const nodeIds = Array.isArray(g.nodeIds)
        ? Array.from(new Set(g.nodeIds.map((id) => String(id)).filter(Boolean)))
            .sort()
            .join(',')
        : '';
      const runtimeActive =
        typeof g.runtimeActive === 'boolean' ? (g.runtimeActive ? '1' : '0') : '';
      return [
        String(g.id ?? ''),
        String(g.parentId ?? ''),
        String(g.name ?? ''),
        String(g.kind ?? ''),
        stableJson(g.agentInterface),
        stableJson(g.agentPolicy),
        g.disabled ? '1' : '0',
        g.minimized ? '1' : '0',
        runtimeActive,
        nodeIds,
      ].join(':');
    })
    .join('|');
}

export function normalizeGroupsForSnapshot(
  groups: Array<Record<string, unknown>> | null | undefined
): NodeGroup[] {
  return (Array.isArray(groups) ? groups : []).map((g) => {
    const record = asRecord(g);
    const nodeIds = Array.isArray(record.nodeIds) ? record.nodeIds : [];
    return {
      id: getString(record.id, ''),
      parentId: getString(record.parentId, '') || null,
      name: getString(record.name, ''),
      nodeIds: Array.from(new Set(nodeIds.map((id) => String(id)).filter(Boolean))),
      disabled: getBoolean(record.disabled, false),
      kind: record.kind === 'ai-space' ? 'ai-space' : record.kind === 'group' ? 'group' : undefined,
      agentInterface:
        record.agentInterface !== undefined
          ? cloneJsonValue(record.agentInterface as NodeGroup['agentInterface'])
          : undefined,
      agentPolicy:
        record.agentPolicy !== undefined
          ? cloneJsonValue(record.agentPolicy as NodeGroup['agentPolicy'])
          : undefined,
      minimized: getBoolean(record.minimized, false),
      runtimeActive:
        typeof record.runtimeActive === 'boolean' ? Boolean(record.runtimeActive) : undefined,
    };
  });
}
