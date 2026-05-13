/**
 * Purpose: Compute manager-only group visual state patches for graph nodes and connections.
 */
import type { GraphState } from '$lib/nodes/types';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import { groupIdFromNode, isGroupPortNodeType } from '../utils/group-port-utils';
import { buildGroupIndex } from './group-bounds';
import type { NodeGroup } from './group-types';

export type GroupNodeVisualPatch = {
  nodeId: string;
  hidden?: boolean;
  groupDisabled?: boolean;
  groupSelected?: boolean;
  groupMinimized?: boolean;
};

export type GroupConnectionVisualPatch = {
  connectionId: string;
  hidden?: boolean;
};

export type GroupVisualStatePlan = {
  nodePatches: GroupNodeVisualPatch[];
  connectionPatches: GroupConnectionVisualPatch[];
};

type ExistingNodeVisualState = {
  hidden?: boolean;
  groupDisabled?: boolean;
  groupSelected?: boolean;
  groupMinimized?: boolean;
};

type ExistingConnectionVisualState = {
  hidden?: boolean;
};

export type GroupVisualStatePlanOptions = {
  graph: GraphState;
  groups: NodeGroup[];
  disabledNodeIds: Set<string>;
  selectedNodeIds: Set<string>;
  forcedHiddenNodeIds: Set<string>;
  getNodeVisualState: (nodeId: string) => ExistingNodeVisualState | null;
  getConnectionVisualState: (connectionId: string) => ExistingConnectionVisualState | null;
};

export function computeGroupVisualStatePlan(options: GroupVisualStatePlanOptions): GroupVisualStatePlan {
  const {
    graph,
    groups,
    disabledNodeIds,
    selectedNodeIds,
    forcedHiddenNodeIds,
    getNodeVisualState,
    getConnectionVisualState,
  } = options;

  const hiddenNodeIds = new Set<string>();
  const minimizedGroupIds: string[] = [];
  for (const g of groups) {
    if (!g.minimized) continue;
    minimizedGroupIds.push(String(g.id));
    for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
  }
  const minimizedGroupIdSet = new Set(minimizedGroupIds);
  const hiddenGroupIds = collectHiddenDescendantGroupIds(groups, minimizedGroupIds);
  const hiddenNodesEffective = new Set<string>();
  const nodePatches: GroupNodeVisualPatch[] = [];

  for (const node of graph.nodes ?? []) {
    const id = String(node.id);
    if (!id) continue;

    const type = String(node.type ?? '');
    const nextHidden =
      forcedHiddenNodeIds.has(id) ||
      hiddenNodeIds.has(id) ||
      (isGroupDecorationNodeType(type) && hiddenGroupIds.has(groupIdFromNode(node)));
    if (nextHidden) hiddenNodesEffective.add(id);

    const nextDisabled = disabledNodeIds.has(id);
    const nextSelected = selectedNodeIds.has(id);
    const nextGroupMinimized = isGroupPortNodeType(type) && minimizedGroupIdSet.has(groupIdFromNode(node));
    const prev = getNodeVisualState(id);

    const patch: GroupNodeVisualPatch = { nodeId: id };
    if (Boolean(prev?.hidden) !== nextHidden) patch.hidden = nextHidden;
    if (Boolean(prev?.groupDisabled) !== nextDisabled) patch.groupDisabled = nextDisabled;
    if (Boolean(prev?.groupSelected) !== nextSelected) patch.groupSelected = nextSelected;
    if (Boolean(prev?.groupMinimized) !== nextGroupMinimized) patch.groupMinimized = nextGroupMinimized;
    if (hasNodeVisualPatch(patch)) nodePatches.push(patch);
  }

  const connectionPatches: GroupConnectionVisualPatch[] = [];
  for (const conn of graph.connections ?? []) {
    const id = String(conn.id);
    if (!id) continue;
    const nextHidden =
      hiddenNodesEffective.has(String(conn.sourceNodeId)) || hiddenNodesEffective.has(String(conn.targetNodeId));
    const prev = getConnectionVisualState(id);
    if (Boolean(prev?.hidden) !== nextHidden) connectionPatches.push({ connectionId: id, hidden: nextHidden });
  }

  return { nodePatches, connectionPatches };
}

function collectHiddenDescendantGroupIds(groups: NodeGroup[], minimizedGroupIds: string[]): Set<string> {
  const hiddenGroupIds = new Set<string>();
  if (minimizedGroupIds.length === 0) return hiddenGroupIds;

  const { childrenByParentId } = buildGroupIndex(groups);
  const stack: string[] = [];
  for (const gid of minimizedGroupIds) {
    for (const childId of childrenByParentId.get(String(gid)) ?? []) stack.push(String(childId));
  }

  while (stack.length > 0) {
    const next = String(stack.pop() ?? '');
    if (!next || hiddenGroupIds.has(next)) continue;
    hiddenGroupIds.add(next);
    for (const childId of childrenByParentId.get(next) ?? []) stack.push(String(childId));
  }

  return hiddenGroupIds;
}

function hasNodeVisualPatch(patch: GroupNodeVisualPatch): boolean {
  return (
    'hidden' in patch ||
    'groupDisabled' in patch ||
    'groupSelected' in patch ||
    'groupMinimized' in patch
  );
}
