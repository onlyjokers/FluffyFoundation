/**
 * Purpose: Group frame bounds and geometry helpers for NodeCanvas.
 */
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import type { NodeGroup } from './group-types';

export function mergeBounds(base: NodeBounds | null, next: NodeBounds | null): NodeBounds | null {
  if (!next) return base;
  if (!base) return { ...next };
  return {
    left: Math.min(base.left, next.left),
    top: Math.min(base.top, next.top),
    right: Math.max(base.right, next.right),
    bottom: Math.max(base.bottom, next.bottom),
  };
}

export const boundsIntersect = (a: NodeBounds, b: NodeBounds): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function pickMoveDelta(bounds: NodeBounds, target: NodeBounds, margin: number) {
  const moveLeft = bounds.left - margin - target.right;
  const moveRight = bounds.right + margin - target.left;
  const moveUp = bounds.top - margin - target.bottom;
  const moveDown = bounds.bottom + margin - target.top;

  const candidates = [
    { dx: moveLeft, dy: 0 },
    { dx: moveRight, dy: 0 },
    { dx: 0, dy: moveUp },
    { dx: 0, dy: moveDown },
  ];
  candidates.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
  return candidates[0] ?? null;
}

export function buildGroupIndex(groups: NodeGroup[]) {
  const byId = new Map<string, NodeGroup>();
  const childrenByParentId = new Map<string, string[]>();

  for (const group of groups) {
    const id = String(group.id);
    const parentId = group.parentId ? String(group.parentId) : null;
    const normalized: NodeGroup = {
      ...group,
      id,
      parentId,
      nodeIds: (group.nodeIds ?? []).map((nodeId) => String(nodeId)),
      minimized: Boolean(group.minimized),
    };
    byId.set(id, normalized);
    if (!parentId) continue;
    const list = childrenByParentId.get(parentId) ?? [];
    list.push(id);
    childrenByParentId.set(parentId, list);
  }

  return { byId, childrenByParentId };
}

export type ComputeGroupFrameBoundsOptions = {
  groupId: string;
  byId: Map<string, NodeGroup>;
  childrenByParentId: Map<string, string[]>;
  cache: Map<string, NodeBounds | null>;
  visiting: Set<string>;
  hiddenNodeIds: Set<string>;
  graph: GraphState;
  localLoops: LocalLoop[];
  getNodeBounds: (nodeId: string) => NodeBounds | null;
};

export type ComputeSingleGroupBoundsOptions = {
  groupId: string;
  groups: NodeGroup[];
  graph: GraphState;
  localLoops: LocalLoop[];
  getNodeBounds: (nodeId: string) => NodeBounds | null;
};

export function computeSingleGroupFrameBounds(options: ComputeSingleGroupBoundsOptions): NodeBounds | null {
  const { groupId, groups, graph, localLoops, getNodeBounds } = options;
  const { byId, childrenByParentId } = buildGroupIndex(groups);
  const hiddenNodeIds = new Set<string>();
  for (const group of groups) {
    if (!group.minimized) continue;
    for (const nodeId of group.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
  }

  return computeGroupFrameBoundsWithChildren({
    groupId,
    byId,
    childrenByParentId,
    cache: new Map(),
    visiting: new Set(),
    hiddenNodeIds,
    graph,
    localLoops,
    getNodeBounds,
  });
}

export function computeGroupFrameBoundsWithChildren(options: ComputeGroupFrameBoundsOptions): NodeBounds | null {
  const { groupId, byId, childrenByParentId, cache, visiting, hiddenNodeIds, graph, localLoops, getNodeBounds } =
    options;
  const cached = cache.get(groupId);
  if (cached !== undefined) return cached;
  if (visiting.has(groupId)) return null;

  const group = byId.get(groupId);
  if (!group) return null;

  visiting.add(groupId);

  const minimized = Boolean(group.minimized);
  const isSubGroup = Boolean(group.parentId);
  const paddingX = isSubGroup ? 36 : 52;
  const paddingTop = isSubGroup ? 54 : 64;
  const paddingBottom = isSubGroup ? 40 : 52;

  const loopPaddingX = 56;
  const loopPaddingTop = 64;
  const loopPaddingBottom = 64;

  let bounds: NodeBounds | null = null;
  const nodeById = new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
  const typeByNodeId = new Map((graph.nodes ?? []).map((node) => [String(node.id), String(node.type ?? '')]));
  const isDecorationNodeId = (nodeId: string): boolean => {
    const type = typeByNodeId.get(String(nodeId)) ?? '';
    return isGroupDecorationNodeType(type);
  };

  const unionBoundsFromPositions = (nodeIds: string[]) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const nodeId of nodeIds) {
      if (isDecorationNodeId(nodeId)) continue;
      const node = nodeById.get(String(nodeId));
      if (!node) continue;
      const x = Number(node.position?.x ?? 0);
      const y = Number(node.position?.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const ok =
      Number.isFinite(minX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxX) &&
      Number.isFinite(maxY);
    if (!ok) return null;
    return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  };

  if (minimized) {
    const posBounds = unionBoundsFromPositions(group.nodeIds ?? []);
    const centerX = posBounds?.centerX ?? 220;
    const centerY = posBounds?.centerY ?? 160;

    const proxyNodes = (graph.nodes ?? []).filter(
      (n) =>
        String(n?.type ?? '') === 'group-proxy' &&
        String((n?.config as Record<string, unknown>)?.groupId ?? '') === groupId
    );
    const inputProxyCount = proxyNodes.filter(
      (n) => String((n?.config as Record<string, unknown>)?.direction ?? 'output') === 'input'
    ).length;
    const outputProxyCount = Math.max(0, proxyNodes.length - inputProxyCount);
    const portRows = Math.max(1, Math.max(inputProxyCount, outputProxyCount));

    const width = 230;
    const headerHeight = 44;
    const rowHeight = 28;
    const height = Math.max(84, headerHeight + portRows * rowHeight + 12);
    const compact = {
      left: centerX - width / 2,
      top: centerY - height / 2,
      right: centerX + width / 2,
      bottom: centerY + height / 2,
    };
    cache.set(groupId, compact);
    visiting.delete(groupId);
    return compact;
  }

  const unionBoundsGraph = (nodeIds: string[]): NodeBounds | null => {
    let merged: NodeBounds | null = null;
    for (const nodeId of nodeIds) {
      if (hiddenNodeIds.has(String(nodeId))) continue;
      if (isDecorationNodeId(nodeId)) continue;
      const b = getNodeBounds(String(nodeId));
      merged = mergeBounds(merged, b);
    }
    return merged;
  };

  bounds = mergeBounds(bounds, unionBoundsGraph(group.nodeIds ?? []));

  const groupNodeSet = new Set((group.nodeIds ?? []).map((id) => String(id)));
  for (const loop of localLoops) {
    if (!loop?.nodeIds?.length) continue;
    const fullyContained = loop.nodeIds.every((id) => groupNodeSet.has(String(id)));
    if (!fullyContained) continue;
    const lb = unionBoundsGraph(loop.nodeIds.map(String));
    if (!lb) continue;
    bounds = mergeBounds(bounds, {
      left: lb.left - loopPaddingX,
      top: lb.top - loopPaddingTop,
      right: lb.right + loopPaddingX,
      bottom: lb.bottom + loopPaddingBottom,
    });
  }

  const children = childrenByParentId.get(groupId) ?? [];
  for (const childId of children) {
    const childBounds = computeGroupFrameBoundsWithChildren({ ...options, groupId: childId });
    bounds = mergeBounds(bounds, childBounds);
  }

  visiting.delete(groupId);

  if (!bounds) {
    cache.set(groupId, null);
    return null;
  }

  const padded = {
    left: bounds.left - paddingX,
    top: bounds.top - paddingTop,
    right: bounds.right + paddingX,
    bottom: bounds.bottom + paddingBottom,
  };
  cache.set(groupId, padded);
  return padded;
}

export function computeLoopFrameBounds(
  loop: LocalLoop,
  getNodeBounds: (nodeId: string) => NodeBounds | null
): NodeBounds | null {
  const paddingX = 56;
  const paddingTop = 64;
  const paddingBottom = 64;

  let base: NodeBounds | null = null;
  for (const nodeId of loop.nodeIds ?? []) {
    const b = getNodeBounds(String(nodeId));
    base = mergeBounds(base, b);
  }
  if (!base) return null;

  return {
    left: base.left - paddingX,
    top: base.top - paddingTop,
    right: base.right + paddingX,
    bottom: base.bottom + paddingBottom,
  };
}
