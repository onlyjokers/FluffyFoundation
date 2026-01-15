/**
 * Purpose: Normalize group payloads from graph state into a stable, de-duplicated list.
 */
import type { NodeGroup } from '../controllers/group-controller';

export const normalizeGroupList = (groups: NodeGroup[]): NodeGroup[] => {
  const order: string[] = [];
  const byId = new Map<string, NodeGroup>();

  for (const group of Array.isArray(groups) ? groups : []) {
    const id = String(group?.id ?? '');
    if (!id) continue;

    const next: NodeGroup = {
      id,
      parentId: group?.parentId ? String(group.parentId) : null,
      name: String(group?.name ?? ''),
      nodeIds: Array.from(new Set((group?.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean))),
      disabled: Boolean(group?.disabled),
      minimized: Boolean(group?.minimized),
      runtimeActive: typeof group?.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
    };

    if (!byId.has(id)) order.push(id);

    const prev = byId.get(id);
    if (prev) {
      next.nodeIds = Array.from(new Set([...(prev.nodeIds ?? []), ...next.nodeIds]));
      if (typeof next.runtimeActive !== 'boolean' && typeof prev.runtimeActive === 'boolean') {
        next.runtimeActive = prev.runtimeActive;
      }
    }

    byId.set(id, next);
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
};
