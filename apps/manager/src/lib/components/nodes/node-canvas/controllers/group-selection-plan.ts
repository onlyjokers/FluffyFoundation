/**
 * Purpose: Pure planning for creating a node group from the current selection.
 */
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import type { NodeGroup } from './group-types';

type PlanGroupFromSelectionOptions = {
  selectionNodeIds: string[];
  graph: GraphState;
  groups: NodeGroup[];
  localLoops: LocalLoop[];
  createId: () => string;
};

type PlanGroupFromSelectionResult = {
  group: NodeGroup | null;
  deniedNodeIds: string[];
};

function buildGroupMembership(groups: NodeGroup[]) {
  const byId = new Map<string, NodeGroup>();
  const groupNodeSets = new Map<string, Set<string>>();
  const nodeToGroupIds = new Map<string, string[]>();

  for (const group of groups) {
    const id = String(group.id);
    byId.set(id, { ...group, id, parentId: group.parentId ? String(group.parentId) : null });
    const nodeIds = new Set((group.nodeIds ?? []).map((nodeId) => String(nodeId)));
    groupNodeSets.set(id, nodeIds);
    for (const nodeId of nodeIds) {
      const list = nodeToGroupIds.get(nodeId) ?? [];
      list.push(id);
      nodeToGroupIds.set(nodeId, list);
    }
  }

  return { byId, groupNodeSets, nodeToGroupIds };
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

export function planGroupFromSelection(options: PlanGroupFromSelectionOptions): PlanGroupFromSelectionResult {
  const { selectionNodeIds, graph, groups, localLoops, createId } = options;
  const nodeById = new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
  const selected = selectionNodeIds
    .map((id) => String(id))
    .filter((id) => {
      const type = String(nodeById.get(id)?.type ?? '');
      return !isGroupDecorationNodeType(type);
    });
  if (selected.length === 0) return { group: null, deniedNodeIds: [] };

  const { byId, groupNodeSets, nodeToGroupIds } = buildGroupMembership(groups);
  const getDepth = createDepthResolver(byId);
  const getPrimaryGroupIdForNode = (nodeId: string): string | null => {
    const groupIds = nodeToGroupIds.get(String(nodeId)) ?? [];
    if (groupIds.length === 0) return null;

    let bestId: string | null = null;
    let bestDepth = -1;
    let bestSize = Number.POSITIVE_INFINITY;
    for (const groupId of groupIds) {
      const depth = getDepth(groupId);
      const size = groupNodeSets.get(groupId)?.size ?? Number.POSITIVE_INFINITY;
      if (depth > bestDepth || (depth === bestDepth && size < bestSize)) {
        bestId = groupId;
        bestDepth = depth;
        bestSize = size;
      }
    }
    return bestId;
  };

  let parentId: string | null = null;
  let parentDepth = -1;
  let parentSize = Number.POSITIVE_INFINITY;
  for (const group of groups) {
    const groupId = String(group.id);
    const nodeIds = groupNodeSets.get(groupId);
    if (!nodeIds) continue;
    if (!selected.every((id) => nodeIds.has(String(id)))) continue;

    const depth = getDepth(groupId);
    const size = nodeIds.size;
    if (depth > parentDepth || (depth === parentDepth && size < parentSize)) {
      parentId = groupId;
      parentDepth = depth;
      parentSize = size;
    }
  }

  const deniedNodeIds: string[] = [];
  const ids = new Set<string>();
  for (const nodeId of selected) {
    const primary = getPrimaryGroupIdForNode(nodeId);
    const allowed = parentId ? primary === parentId : primary === null;
    if (!allowed) {
      deniedNodeIds.push(nodeId);
      continue;
    }
    ids.add(nodeId);
  }
  if (ids.size === 0) return { group: null, deniedNodeIds };

  const isEligibleLoopNode = (nodeId: string): boolean => {
    const primary = getPrimaryGroupIdForNode(nodeId);
    return parentId ? primary === parentId : primary === null;
  };
  for (const loop of localLoops) {
    if (!loop?.nodeIds?.length) continue;
    const loopIds = loop.nodeIds.map((id) => String(id));
    if (!loopIds.some((id) => ids.has(id))) continue;
    if (!loopIds.every((id) => isEligibleLoopNode(id))) continue;
    for (const nodeId of loopIds) ids.add(nodeId);
  }

  const nextName = parentId
    ? `Sub Group ${(groups.filter((group) => String(group.parentId ?? '') === String(parentId)).length ?? 0) + 1}`
    : `Group ${groups.filter((group) => !group.parentId).length + 1}`;

  return {
    group: {
      id: createId(),
      parentId,
      name: nextName,
      nodeIds: Array.from(ids),
      disabled: false,
      minimized: false,
      runtimeActive: true,
    },
    deniedNodeIds,
  };
}
