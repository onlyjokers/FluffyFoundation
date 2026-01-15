// Purpose: Group hierarchy helpers for node graph frames.

type GroupLike = {
  id?: string | number | null;
  parentId?: string | number | null;
  nodeIds?: Array<string | number>;
};

export const deepestGroupIdContainingNode = (nodeId: string, groups: GroupLike[]): string | null => {
  const byId = new Map(groups.map((g) => [String(g?.id ?? ''), g] as const));
  const depthCache = new Map<string, number>();

  const depthOf = (groupId: string, visiting = new Set<string>()): number => {
    const cached = depthCache.get(groupId);
    if (cached !== undefined) return cached;
    if (visiting.has(groupId)) return 0;
    visiting.add(groupId);
    const g = byId.get(String(groupId));
    const parentId = g?.parentId ? String(g.parentId) : null;
    const depth = parentId && byId.has(parentId) ? depthOf(parentId, visiting) + 1 : 0;
    visiting.delete(groupId);
    depthCache.set(groupId, depth);
    return depth;
  };

  let best: { id: string; depth: number } | null = null;
  for (const g of groups) {
    const id = String(g?.id ?? '');
    if (!id) continue;
    const nodeIds = Array.isArray(g?.nodeIds) ? g.nodeIds.map(String) : [];
    if (!nodeIds.includes(String(nodeId))) continue;
    const depth = depthOf(id);
    if (!best || depth > best.depth) best = { id, depth };
  }
  return best?.id ?? null;
};
