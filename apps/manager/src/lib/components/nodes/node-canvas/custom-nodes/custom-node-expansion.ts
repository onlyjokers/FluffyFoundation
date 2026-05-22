// Purpose: Custom node expansion/collapse logic for Group Frames.
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';

export type ExpandedCustomNodeFrame = {
  groupId: string;
  nodeId: string;
};

type GroupController = {
  scheduleHighlight: () => void;
};

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
};

type CustomNodeExpansionOptions = {
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  onExpandedGroupIdsChange?: (next: Set<string>) => void;
  syncEditorProjection?: () => void;
  nodeEngine: NodeEngine;
  groupController: GroupController;
  requestFramesUpdate: () => void;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
};

export const createCustomNodeExpansion = (opts: CustomNodeExpansionOptions) => {
  let expandedCustomGroupIds = new Set<string>();

  const refreshExpandedCustomGroupIds = () => {
    expandedCustomGroupIds = new Set(Array.from(opts.expandedCustomByGroupId.keys()));
    opts.onExpandedGroupIdsChange?.(new Set(expandedCustomGroupIds));
    return expandedCustomGroupIds;
  };

  const rehydrateExpandedCustomFrames = (state: GraphState) => {
    void state;
  };
  const handleExpandCustomNode = (nodeId: string) => {
    const id = String(nodeId ?? '');
    if (!id) return;

    const node = opts.nodeEngine.getNode(id);
    if (!node) return;

    const state = opts.readCustomNodeState(node.config ?? {});
    if (!state || state.role !== 'mother') return;

    const groupId = String(state.groupId ?? '');
    if (!groupId) return;
    if (opts.expandedCustomByGroupId.has(groupId)) return;

    const def = opts.getCustomNodeDefinition(state.definitionId);
    if (!def) return;

    opts.expandedCustomByGroupId.set(groupId, { groupId, nodeId: id });
    refreshExpandedCustomGroupIds();

    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
    opts.syncEditorProjection?.();
  };
  const handleCollapseCustomNodeFrame = (groupId: string) => {
    const rootGroupId = String(groupId ?? '');
    if (!rootGroupId) return;

    const expanded = opts.expandedCustomByGroupId.get(rootGroupId) ?? null;
    if (!expanded) return;

    const motherNodeId = String(expanded.nodeId ?? '');
    if (!motherNodeId) return;

    opts.expandedCustomByGroupId.delete(rootGroupId);
    refreshExpandedCustomGroupIds();

    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
    opts.syncEditorProjection?.();
  };
  return {
    refreshExpandedCustomGroupIds,
    getExpandedGroupIds: () => new Set(expandedCustomGroupIds),
    rehydrateExpandedCustomFrames,
    handleExpandCustomNode,
    handleCollapseCustomNodeFrame,
  };
};
