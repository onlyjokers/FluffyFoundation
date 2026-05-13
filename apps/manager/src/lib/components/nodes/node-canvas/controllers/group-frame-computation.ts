/**
 * Purpose: Pure group frame derivation for NodeCanvas group rendering.
 */
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import { buildGroupIndex, computeGroupFrameBoundsWithChildren } from './group-bounds';
import type { GroupFrame, NodeGroup } from './group-types';

type ComputeGroupFramesOptions = {
  groups: NodeGroup[];
  editModeGroupId: string | null;
  editModeGroupBounds: NodeBounds | null;
  forcedHiddenNodeIds: Set<string>;
  graph: GraphState;
  localLoops: LocalLoop[];
  getNodeBounds: (nodeId: string) => NodeBounds | null;
};

function collectHiddenGroupIds(childrenByParentId: Map<string, string[]>, minimizedGroupIds: string[]): Set<string> {
  const hiddenGroupIds = new Set<string>();
  const stack: string[] = [];
  for (const groupId of minimizedGroupIds) {
    for (const childId of childrenByParentId.get(String(groupId)) ?? []) {
      stack.push(String(childId));
    }
  }
  while (stack.length > 0) {
    const next = String(stack.pop() ?? '');
    if (!next || hiddenGroupIds.has(next)) continue;
    hiddenGroupIds.add(next);
    for (const childId of childrenByParentId.get(next) ?? []) {
      stack.push(String(childId));
    }
  }
  return hiddenGroupIds;
}

function createDepthResolver(byId: Map<string, NodeGroup>) {
  const depthCache = new Map<string, number>();
  const getDepth = (groupId: string, visiting = new Set<string>()): number => {
    const cached = depthCache.get(groupId);
    if (cached !== undefined) return cached;
    if (visiting.has(groupId)) return 0;
    visiting.add(groupId);

    const group = byId.get(groupId);
    const parentId = group?.parentId && byId.has(String(group.parentId)) ? String(group.parentId) : null;
    const depth = parentId ? getDepth(parentId, visiting) + 1 : 0;

    visiting.delete(groupId);
    depthCache.set(groupId, depth);
    return depth;
  };
  return getDepth;
}

function createEffectiveDisabledResolver(byId: Map<string, NodeGroup>) {
  const effectiveDisabledCache = new Map<string, boolean>();
  const getEffectiveDisabled = (groupId: string, visiting = new Set<string>()): boolean => {
    const cached = effectiveDisabledCache.get(groupId);
    if (cached !== undefined) return cached;
    if (visiting.has(groupId)) return false;
    visiting.add(groupId);

    const group = byId.get(groupId);
    const parentId = group?.parentId && byId.has(String(group.parentId)) ? String(group.parentId) : null;
    const runtimeActive = group?.runtimeActive ?? true;
    const effective =
      Boolean(group?.disabled) || !runtimeActive || (parentId ? getEffectiveDisabled(parentId, visiting) : false);

    visiting.delete(groupId);
    effectiveDisabledCache.set(groupId, effective);
    return effective;
  };
  return getEffectiveDisabled;
}

export function computeGroupFramesFromState(options: ComputeGroupFramesOptions): GroupFrame[] {
  const { groups, editModeGroupId, editModeGroupBounds, forcedHiddenNodeIds, graph, localLoops, getNodeBounds } =
    options;
  const { byId, childrenByParentId } = buildGroupIndex(groups);

  const hiddenNodeIds = new Set<string>(Array.from(forcedHiddenNodeIds).map(String));
  const minimizedGroupIds: string[] = [];
  for (const group of groups) {
    if (!group.minimized) continue;
    minimizedGroupIds.push(String(group.id));
    for (const nodeId of group.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
  }

  const hiddenGroupIds = collectHiddenGroupIds(childrenByParentId, minimizedGroupIds);
  const getDepth = createDepthResolver(byId);
  const getEffectiveDisabled = createEffectiveDisabledResolver(byId);
  const boundsCache = new Map<string, NodeBounds | null>();
  const computeBoundsCached = (groupId: string) =>
    computeGroupFrameBoundsWithChildren({
      groupId,
      byId,
      childrenByParentId,
      cache: boundsCache,
      visiting: new Set(),
      hiddenNodeIds,
      graph,
      localLoops,
      getNodeBounds,
    });

  const frames: GroupFrame[] = [];
  for (const group of groups) {
    const groupId = String(group.id);
    if (hiddenGroupIds.has(groupId)) continue;

    const depth = getDepth(groupId);
    const effectiveDisabled = getEffectiveDisabled(groupId);
    const bounds =
      editModeGroupId === group.id && editModeGroupBounds ? { ...editModeGroupBounds } : computeBoundsCached(groupId);
    if (!bounds) continue;

    frames.push({
      group,
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
      effectiveDisabled,
      depth,
    });
  }

  frames.sort((a, b) => a.depth - b.depth);
  return frames;
}
