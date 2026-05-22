// Purpose: Custom node expansion/collapse logic for Group Frames.
import type { Readable } from 'svelte/store';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import type { NodeRegistry } from '@shugu/node-core';
import type { GroupFrame, NodeGroup } from '../controllers/group-controller';

export type ExpandedCustomNodeFrame = {
  groupId: string;
  nodeId: string;
};

type GroupController = {
  nodeGroups: Readable<NodeGroup[]>;
  setGroups: (groups: NodeGroup[]) => void;
  scheduleHighlight: () => void;
};

type GroupPortNodesController = {
  ensureGroupPortNodes: () => void;
  scheduleAlign: () => void;
  scheduleNormalizeProxies: () => void;
};

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
  exportGraph: () => GraphState;
  lastError?: { set?: (msg: string) => void };
};

type CustomNodeExpansionOptions = {
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  onExpandedGroupIdsChange?: (next: Set<string>) => void;
  syncEditorProjection?: () => void;
  forcedHiddenNodeIds: Set<string>;
  nodeEngine: NodeEngine;
  groupController: GroupController;
  groupPortNodesController: GroupPortNodesController;
  groupFrames: Readable<GroupFrame[]>;
  nodeRegistry: NodeRegistry;
  requestFramesUpdate: () => void;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: CustomNodeInstanceState
  ) => Record<string, unknown>;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
  upsertCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  customNodeDefinitions: Readable<CustomNodeDefinition[]>;
  definitionsInCycles: (defs: CustomNodeDefinition[]) => Set<string>;
  buildGroupPortIndex: (state: GraphState) => Map<string, { gateId?: string }>;
  groupIdFromNode: (node: NodeInstance) => string | null;
  isGroupPortNodeType: (type: string) => boolean;
  deepestGroupIdContainingNode: (nodeId: string, groups: NodeGroup[]) => string | null;
  syncCoupledCustomNodesForDefinition: (definitionId: string) => void;
  materializeInternalNodeId: (customNodeId: string, internalNodeId: string) => string;
  isMaterializedInternalNodeId: (customNodeId: string, nodeId: string) => boolean;
  internalNodeIdFromMaterialized: (customNodeId: string, nodeId: string) => string;
  customNodeIdFromMaterializedNodeId: (nodeId: string) => string | null;
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
