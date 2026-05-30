/**
 * Purpose: Pure serialization helpers for group metadata stored in local Manager projects.
 */
import type { NodeGroup } from '$lib/components/nodes/node-canvas/controllers/group-controller';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const cloneJsonValue = <T>(value: T): T =>
  value == null ? value : (JSON.parse(JSON.stringify(value)) as T);

export function serializeProjectGroupsForStorage(groups: NodeGroup[]): NodeGroup[] {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    id: String(group.id),
    parentId: group.parentId ? String(group.parentId) : null,
    name: String(group.name ?? ''),
    nodeIds: (group.nodeIds ?? []).map((id) => String(id)).filter(Boolean),
    disabled: Boolean(group.disabled),
    kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
    minimized: Boolean(group.minimized),
    runtimeActive:
      typeof group.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
    agentInterface:
      group.agentInterface !== undefined ? cloneJsonValue(group.agentInterface) : undefined,
    agentPolicy: group.agentPolicy !== undefined ? cloneJsonValue(group.agentPolicy) : undefined,
  }));
}

export function parseProjectGroupsFromStorage(value: unknown): NodeGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: NodeGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const parentIdRaw = item.parentId;
    groups.push({
      id,
      parentId: typeof parentIdRaw === 'string' && parentIdRaw ? parentIdRaw : null,
      name: typeof item.name === 'string' ? item.name : String(item.name ?? ''),
      nodeIds: Array.isArray(item.nodeIds)
        ? item.nodeIds.map((v) => String(v)).filter(Boolean)
        : [],
      disabled: Boolean(item.disabled),
      kind: item.kind === 'ai-space' ? 'ai-space' : item.kind === 'group' ? 'group' : undefined,
      minimized: Boolean(item.minimized),
      runtimeActive:
        typeof item.runtimeActive === 'boolean' ? item.runtimeActive : undefined,
      agentInterface:
        item.agentInterface !== undefined
          ? (cloneJsonValue(item.agentInterface) as NodeGroup['agentInterface'])
          : undefined,
      agentPolicy:
        item.agentPolicy !== undefined
          ? (cloneJsonValue(item.agentPolicy) as NodeGroup['agentPolicy'])
          : undefined,
    });
  }
  return groups;
}
