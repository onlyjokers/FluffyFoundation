/**
 * Purpose: Pure helpers for post-drag group and loop frame enforcement.
 */
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds, ViewportTransform } from '../adapters';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import type { FrameInfo, FrameMoveContext, NodeGroup } from './group-types';

type Point = { cx: number; cy: number };

type BuildDropFrameContextOptions = {
  groups: NodeGroup[];
  loops: LocalLoop[];
  editModeGroupId: string | null;
  editModeGroupBounds: NodeBounds | null;
  computeGroupBounds: (groupId: string) => NodeBounds | null;
  computeLoopBounds: (loop: LocalLoop) => NodeBounds | null;
};

type DropFrameContext = {
  groupNodeSets: Map<string, Set<string>>;
  loopNodeSets: Map<string, Set<string>>;
  frameById: Map<string, FrameInfo>;
  frameMoves: FrameMoveContext | undefined;
};

export function buildDropFrameContext(options: BuildDropFrameContextOptions): DropFrameContext {
  const { groups, loops, editModeGroupId, editModeGroupBounds, computeGroupBounds, computeLoopBounds } = options;
  const groupNodeSets = new Map<string, Set<string>>();
  for (const group of groups) {
    groupNodeSets.set(String(group.id), new Set((group.nodeIds ?? []).map((id) => String(id))));
  }

  const frameById = new Map<string, FrameInfo>();
  const loopNodeSets = new Map<string, Set<string>>();
  for (const loop of loops) {
    const loopId = String(loop.id ?? '');
    if (!loopId) continue;
    const nodeIds = new Set((loop.nodeIds ?? []).map((id) => String(id)));
    loopNodeSets.set(loopId, nodeIds);
    const bounds = computeLoopBounds(loop);
    if (!bounds) continue;
    frameById.set(`loop:${loopId}`, { id: `loop:${loopId}`, kind: 'loop', nodeIds, bounds });
  }

  for (const group of groups) {
    const groupId = String(group.id ?? '');
    if (!groupId) continue;
    const nodeIds = groupNodeSets.get(groupId) ?? new Set();
    const bounds =
      editModeGroupId && editModeGroupBounds && editModeGroupId === groupId
        ? { ...editModeGroupBounds }
        : computeGroupBounds(groupId);
    if (!bounds) continue;
    frameById.set(`group:${groupId}`, { id: `group:${groupId}`, kind: 'group', nodeIds, bounds });
  }

  const frameAreaById = new Map<string, number>();
  const nodeToFrameIds = new Map<string, string[]>();
  for (const [frameId, frame] of frameById.entries()) {
    const area = Math.max(0, (frame.bounds.right - frame.bounds.left) * (frame.bounds.bottom - frame.bounds.top));
    frameAreaById.set(frameId, area);
    for (const nodeId of frame.nodeIds) {
      const id = String(nodeId);
      const list = nodeToFrameIds.get(id) ?? [];
      list.push(frameId);
      nodeToFrameIds.set(id, list);
    }
  }

  for (const [nodeId, list] of nodeToFrameIds.entries()) {
    list.sort((a, b) => {
      const areaA = frameAreaById.get(a) ?? Number.POSITIVE_INFINITY;
      const areaB = frameAreaById.get(b) ?? Number.POSITIVE_INFINITY;
      return areaA - areaB;
    });
    nodeToFrameIds.set(nodeId, list);
  }

  return {
    groupNodeSets,
    loopNodeSets,
    frameById,
    frameMoves: frameById.size > 0 ? { frameById, nodeToFrameIds, movedFrameIds: new Set() } : undefined,
  };
}

export function shouldEnforceFrameForMovedNodes(
  movedNodeIds: string[],
  frameNodeIds: Set<string>,
  bounds: NodeBounds,
  getNodeCenter: (nodeId: string) => Point | null
): boolean {
  for (const movedId of movedNodeIds) {
    const id = String(movedId);
    if (frameNodeIds.has(id)) return true;
    const center = getNodeCenter(id);
    if (!center) continue;
    if (center.cx > bounds.left && center.cx < bounds.right && center.cy > bounds.top && center.cy < bounds.bottom) {
      return true;
    }
  }
  return false;
}

export function pickSmallestGroupAtPoint(
  groups: NodeGroup[],
  gx: number,
  gy: number,
  getGroupBounds: (groupId: string, group: NodeGroup) => NodeBounds | null
): NodeGroup | null {
  let picked: NodeGroup | null = null;
  let pickedArea = Number.POSITIVE_INFINITY;

  for (const group of groups) {
    const bounds = getGroupBounds(String(group.id), group);
    if (!bounds) continue;
    const inside = gx >= bounds.left && gx <= bounds.right && gy >= bounds.top && gy <= bounds.bottom;
    if (!inside) continue;

    const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    if (area < pickedArea) {
      picked = group;
      pickedArea = area;
    }
  }

  return picked;
}

export function planAddNodeToGroupChain(options: {
  groups: NodeGroup[];
  groupId: string;
  nodeId: string;
}): { nextGroups: NodeGroup[]; didAdd: boolean; effectiveDisabled: boolean } {
  const { groups, groupId, nodeId } = options;
  const rootId = String(groupId ?? '');
  const createdId = String(nodeId ?? '');
  if (!rootId || !createdId) return { nextGroups: groups, didAdd: false, effectiveDisabled: false };

  const byId = new Map<string, NodeGroup>();
  for (const group of groups) byId.set(String(group.id), group);

  const targetAndAncestors = new Set<string>();
  let cursor: string | null = rootId;
  while (cursor) {
    if (targetAndAncestors.has(cursor)) break;
    targetAndAncestors.add(cursor);
    const group = byId.get(cursor);
    const parentId = group?.parentId ? String(group.parentId) : '';
    cursor = parentId && byId.has(parentId) ? parentId : null;
  }

  const effectiveDisabled = Array.from(targetAndAncestors).some((id) => {
    const group = byId.get(id);
    const runtimeActive = group?.runtimeActive ?? true;
    return Boolean(group?.disabled) || !runtimeActive;
  });

  let didAdd = false;
  const nextGroups = groups.map((group) => {
    if (!targetAndAncestors.has(String(group.id))) return group;
    const set = new Set((group.nodeIds ?? []).map((id) => String(id)));
    if (set.has(createdId)) return group;
    set.add(createdId);
    if (String(group.id) === rootId) didAdd = true;
    return { ...group, nodeIds: Array.from(set) };
  });

  return { nextGroups, didAdd, effectiveDisabled };
}

export function planDisassembleGroup(options: {
  groups: NodeGroup[];
  groupId: string;
}): { nextGroups: NodeGroup[]; removedGroupIds: Set<string> } {
  const { groups, groupId } = options;
  const rootId = String(groupId ?? '');
  if (!rootId || !groups.some((group) => String(group.id) === rootId)) {
    return { nextGroups: groups, removedGroupIds: new Set() };
  }

  const childrenByParentId = new Map<string, string[]>();
  for (const group of groups) {
    const parentId = group.parentId ? String(group.parentId) : '';
    if (!parentId) continue;
    const list = childrenByParentId.get(parentId) ?? [];
    list.push(String(group.id));
    childrenByParentId.set(parentId, list);
  }

  const removedGroupIds = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || removedGroupIds.has(id)) continue;
    removedGroupIds.add(id);
    for (const childId of childrenByParentId.get(id) ?? []) stack.push(childId);
  }

  return {
    nextGroups: groups.filter((group) => !removedGroupIds.has(String(group.id))),
    removedGroupIds,
  };
}

export function computeSelectionScreenBounds(options: {
  nodeIds: string[];
  transform: ViewportTransform;
  getNodeBounds: (nodeId: string) => NodeBounds | null;
}): { left: number; top: number; width: number; height: number } | null {
  const { nodeIds, transform, getNodeBounds } = options;
  if (nodeIds.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const bounds = getNodeBounds(String(nodeId));
    if (!bounds) continue;
    left = Math.min(left, bounds.left * transform.k + transform.tx);
    top = Math.min(top, bounds.top * transform.k + transform.ty);
    right = Math.max(right, bounds.right * transform.k + transform.tx);
    bottom = Math.max(bottom, bounds.bottom * transform.k + transform.ty);
  }

  const hasBounds =
    Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom);
  if (!hasBounds) return null;

  const pad = 18;
  return {
    left: left - pad,
    top: top - pad,
    width: right - left + pad * 2,
    height: bottom - top + pad * 2,
  };
}

export function planEditGroupMembershipChange(options: {
  movedNodeIds: string[];
  group: NodeGroup;
  bounds: NodeBounds;
  graph: GraphState;
  getNodeCenter: (nodeId: string) => Point | null;
}): { added: string[]; removed: string[] } {
  const { movedNodeIds, group, bounds, graph, getNodeCenter } = options;
  const nextSet = new Set((group.nodeIds ?? []).map((id) => String(id)));
  const typeByNodeId = new Map((graph.nodes ?? []).map((node) => [String(node.id), String(node.type ?? '')]));
  const added: string[] = [];
  const removed: string[] = [];

  for (const movedId of movedNodeIds) {
    const id = String(movedId);
    if (isGroupDecorationNodeType(typeByNodeId.get(id) ?? '')) continue;
    const center = getNodeCenter(id);
    if (!center) continue;
    const inside =
      center.cx > bounds.left && center.cx < bounds.right && center.cy > bounds.top && center.cy < bounds.bottom;

    if (inside && !nextSet.has(id)) {
      nextSet.add(id);
      added.push(id);
    }
    if (!inside && nextSet.has(id)) {
      nextSet.delete(id);
      removed.push(id);
    }
  }

  return { added, removed };
}

export function applyEditGroupMembershipChange(options: {
  groups: NodeGroup[];
  targetGroupId: string;
  added: string[];
  removed: string[];
}): { nextGroups: NodeGroup[]; effectiveDisabled: boolean } {
  const { groups, targetGroupId, added, removed } = options;
  const byId = new Map<string, NodeGroup>();
  const childrenByParentId = new Map<string, string[]>();
  for (const group of groups) {
    byId.set(String(group.id), group);
    const parentId = group.parentId ? String(group.parentId) : '';
    if (!parentId) continue;
    const list = childrenByParentId.get(parentId) ?? [];
    list.push(String(group.id));
    childrenByParentId.set(parentId, list);
  }

  const targetAndAncestors = new Set<string>();
  let cursor: string | null = String(targetGroupId);
  while (cursor) {
    if (targetAndAncestors.has(cursor)) break;
    targetAndAncestors.add(cursor);
    const group = byId.get(cursor);
    const parentId = group?.parentId ? String(group.parentId) : '';
    cursor = parentId && byId.has(parentId) ? parentId : null;
  }

  const targetAndDescendants = new Set<string>();
  const stack = [String(targetGroupId)];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || targetAndDescendants.has(id)) continue;
    targetAndDescendants.add(id);
    for (const childId of childrenByParentId.get(id) ?? []) stack.push(childId);
  }

  const effectiveDisabled = Array.from(targetAndAncestors).some((id) => {
    const group = byId.get(id);
    const runtimeActive = group?.runtimeActive ?? true;
    return Boolean(group?.disabled) || !runtimeActive;
  });

  const nextGroups = groups.map((group) => {
    const id = String(group.id);
    let changed = false;
    let nextNodeIds = Array.from((group.nodeIds ?? []).map((nodeId) => String(nodeId)));

    if (added.length > 0 && targetAndAncestors.has(id)) {
      const set = new Set(nextNodeIds);
      for (const nodeId of added) {
        if (set.has(nodeId)) continue;
        set.add(nodeId);
        changed = true;
      }
      if (changed) nextNodeIds = Array.from(set);
    }

    if (removed.length > 0 && targetAndDescendants.has(id)) {
      const set = new Set(nextNodeIds);
      for (const nodeId of removed) {
        if (!set.has(nodeId)) continue;
        set.delete(nodeId);
        changed = true;
      }
      if (changed) nextNodeIds = Array.from(set);
    }

    return changed ? { ...group, nodeIds: nextNodeIds } : group;
  });

  return { nextGroups, effectiveDisabled };
}
