/**
 * Purpose: Pure graph reconciliation for persisted node groups.
 */
import type { GraphState } from '$lib/nodes/types';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import type { NodeGroup } from './group-types';

export type GroupReconcileResult = {
  changed: boolean;
  nextGroups: NodeGroup[];
  removedGroupIds: string[];
  existingNodeIds: Set<string>;
};

export function reconcileGroupsWithGraphNodes(
  groupsSnapshot: NodeGroup[],
  graph: GraphState
): GroupReconcileResult {
  const existingNodeIds = new Set<string>();
  for (const node of graph.nodes ?? []) {
    const id = String(node.id ?? '');
    if (!id) continue;
    if (isGroupDecorationNodeType(String(node.type ?? ''))) continue;
    existingNodeIds.add(id);
  }

  const prevById = new Map<string, NodeGroup>();
  for (const g of groupsSnapshot) prevById.set(String(g.id), g);

  const normalized: NodeGroup[] = [];
  const byId = new Map<string, NodeGroup>();
  for (const group of groupsSnapshot) {
    const id = String(group?.id ?? '');
    if (!id) continue;
    const parentId = group?.parentId ? String(group.parentId) : null;
    const nodeIds = Array.from(new Set((group.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean))).filter(
      (nid) => existingNodeIds.has(nid)
    );
    const next: NodeGroup = { ...group, id, parentId, nodeIds };
    normalized.push(next);
    byId.set(id, next);
  }

  if (normalized.length === 0) {
    const removedIds = Array.from(prevById.keys()).filter(Boolean);
    return { changed: removedIds.length > 0, nextGroups: [], removedGroupIds: removedIds, existingNodeIds };
  }

  const childrenByParent = new Map<string, string[]>();
  for (const g of normalized) {
    const pid = g.parentId ? String(g.parentId) : '';
    if (!pid || pid === g.id || !byId.has(pid)) continue;
    const list = childrenByParent.get(pid) ?? [];
    list.push(g.id);
    childrenByParent.set(pid, list);
  }

  const unionCache = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const computeUnion = (id: string): Set<string> => {
    const cached = unionCache.get(id);
    if (cached) return cached;
    if (visiting.has(id)) return new Set((byId.get(id)?.nodeIds ?? []).map(String));
    visiting.add(id);
    const base = new Set((byId.get(id)?.nodeIds ?? []).map(String));
    for (const childId of childrenByParent.get(id) ?? []) {
      const childUnion = computeUnion(String(childId));
      for (const nid of childUnion) base.add(nid);
    }
    visiting.delete(id);
    unionCache.set(id, base);
    return base;
  };

  for (const g of normalized) computeUnion(g.id);

  const removedGroupIds = new Set<string>();
  for (const g of normalized) {
    const union = unionCache.get(g.id) ?? new Set();
    if (union.size === 0) removedGroupIds.add(g.id);
  }

  let changed = removedGroupIds.size > 0;
  const nextGroups: NodeGroup[] = [];

  for (const g of normalized) {
    if (removedGroupIds.has(g.id)) continue;
    const union = unionCache.get(g.id) ?? new Set<string>();
    const preferred = Array.from((g.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean));
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const nid of preferred) {
      if (!union.has(nid) || seen.has(nid)) continue;
      seen.add(nid);
      ordered.push(nid);
    }
    const extras = Array.from(union).filter((nid) => !seen.has(nid));
    extras.sort();
    ordered.push(...extras);

    const nextParentId =
      g.parentId && byId.has(String(g.parentId)) && !removedGroupIds.has(String(g.parentId))
        ? String(g.parentId)
        : null;

    const prev = prevById.get(g.id);
    if (prev) {
      const prevParentId = prev.parentId ? String(prev.parentId) : null;
      const prevNodeIds = Array.from((prev.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean));
      if (prevParentId !== nextParentId) changed = true;
      if (prevNodeIds.length !== ordered.length) changed = true;
      else {
        for (let i = 0; i < ordered.length; i += 1) {
          if (prevNodeIds[i] !== ordered[i]) {
            changed = true;
            break;
          }
        }
      }
    } else {
      changed = true;
    }

    nextGroups.push({ ...g, parentId: nextParentId, nodeIds: ordered });
  }

  return {
    changed,
    nextGroups,
    removedGroupIds: Array.from(removedGroupIds),
    existingNodeIds,
  };
}
