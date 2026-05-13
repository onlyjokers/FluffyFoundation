// Purpose: Compose Custom Node handlers/actions/expansion for NodeCanvas.
import type { Readable } from 'svelte/store';
import type { NodeRegistry } from '@shugu/node-core';
import type { GraphState } from '$lib/nodes/types';
import type { nodeEngine as managerNodeEngine } from '$lib/nodes/engine';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import type { GraphViewAdapter } from '../adapters';
import type { GroupController, GroupFrame, NodeGroup } from '../controllers/group-controller';
import type { GroupPortNodesController } from '../controllers/group-port-nodes-controller';
import type { ExpandedCustomNodeFrame } from './custom-node-expansion';
import { createCustomNodeExpansion } from './custom-node-expansion';
import { createCustomNodeHandlers } from './custom-node-handlers';
import { createCustomNodeActions } from './custom-node-actions';
import { createCustomNodeInstanceSync } from './custom-node-instance-sync';

type CustomNodeCompositionOptions = {
  nodeEngine: typeof managerNodeEngine;
  nodeRegistry: NodeRegistry;
  groupController: GroupController;
  groupPortNodesController: GroupPortNodesController;
  groupFrames: Readable<GroupFrame[]>;
  viewAdapter: GraphViewAdapter;
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  forcedHiddenNodeIds: Set<string>;
  setExpandedCustomGroupIds: (next: Set<string>) => void;
  customNodeType: (definitionId: string) => string;
  addCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  removeCustomNodeDefinition: (definitionId: string) => void;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
  upsertCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  customNodeDefinitions: Readable<CustomNodeDefinition[]>;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: CustomNodeInstanceState
  ) => Record<string, unknown>;
  syncCustomNodeInternalGraph: (input: {
    current: GraphState;
    template: GraphState;
    instanceGroupId?: string;
  }) => GraphState;
  syncNestedCustomNodesToDefinition: (input: {
    graph: GraphState;
    definitionId: string;
    definitionTemplate: GraphState;
  }) => { changed: boolean; graph: GraphState };
  definitionsInCycles: (defs: CustomNodeDefinition[]) => Set<string>;
  buildGroupPortIndex: (
    state: GraphState
  ) => Map<string, { gateId?: string; proxyIds?: string[]; legacyActivateIds?: string[] }>;
  groupIdFromNode: (node: GraphState['nodes'][number]) => string | null;
  isGroupPortNodeType: (type: string) => boolean;
  deepestGroupIdContainingNode: (nodeId: string, groups: NodeGroup[]) => string | null;
  materializeInternalNodeId: (customNodeId: string, internalNodeId: string) => string;
  isMaterializedInternalNodeId: (customNodeId: string, nodeId: string) => boolean;
  internalNodeIdFromMaterialized: (customNodeId: string, nodeId: string) => string;
  customNodeIdFromMaterializedNodeId: (nodeId: string) => string | null;
  requestFramesUpdate: () => void;
  setSelectedNode: (nodeId: string) => void;
};

export function createCustomNodeComposition(opts: CustomNodeCompositionOptions) {
  let customNodeActions: ReturnType<typeof createCustomNodeActions> | null = null;

  const syncCoupledCustomNodesForDefinition = createCustomNodeInstanceSync({
    nodeEngine: opts.nodeEngine,
    customNodeType: opts.customNodeType,
    getCustomNodeDefinition: opts.getCustomNodeDefinition,
    readCustomNodeState: opts.readCustomNodeState,
    writeCustomNodeState: opts.writeCustomNodeState,
    syncCustomNodeInternalGraph: opts.syncCustomNodeInternalGraph,
    syncNestedCustomNodesToDefinition: opts.syncNestedCustomNodesToDefinition,
  });

  const customNodeHandlers = createCustomNodeHandlers({
    groupController: opts.groupController,
    nodeEngine: opts.nodeEngine,
    expandedCustomByGroupId: opts.expandedCustomByGroupId,
    readCustomNodeState: opts.readCustomNodeState,
    writeCustomNodeState: opts.writeCustomNodeState,
    getCustomNodeDefinition: opts.getCustomNodeDefinition,
    upsertCustomNodeDefinition: opts.upsertCustomNodeDefinition,
    getCustomNodeActions: () => customNodeActions,
  });

  const refreshExpandedCustomGroupIds = () => {
    customNodeExpansion.refreshExpandedCustomGroupIds();
  };

  customNodeActions = createCustomNodeActions({
    nodeEngine: opts.nodeEngine,
    nodeRegistry: opts.nodeRegistry,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    groupFrames: opts.groupFrames,
    viewAdapter: opts.viewAdapter,
    buildGroupPortIndex: opts.buildGroupPortIndex,
    groupIdFromNode: opts.groupIdFromNode,
    customNodeType: opts.customNodeType,
    addCustomNodeDefinition: opts.addCustomNodeDefinition,
    removeCustomNodeDefinition: opts.removeCustomNodeDefinition,
    getCustomNodeDefinition: opts.getCustomNodeDefinition,
    readCustomNodeState: opts.readCustomNodeState,
    writeCustomNodeState: opts.writeCustomNodeState,
    expandedCustomByGroupId: opts.expandedCustomByGroupId,
    forcedHiddenNodeIds: opts.forcedHiddenNodeIds,
    refreshExpandedCustomGroupIds,
    requestFramesUpdate: opts.requestFramesUpdate,
    setSelectedNode: opts.setSelectedNode,
  });

  const customNodeExpansion = createCustomNodeExpansion({
    expandedCustomByGroupId: opts.expandedCustomByGroupId,
    onExpandedGroupIdsChange: opts.setExpandedCustomGroupIds,
    forcedHiddenNodeIds: opts.forcedHiddenNodeIds,
    nodeEngine: opts.nodeEngine,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    groupFrames: opts.groupFrames,
    nodeRegistry: opts.nodeRegistry,
    requestFramesUpdate: opts.requestFramesUpdate,
    readCustomNodeState: opts.readCustomNodeState,
    writeCustomNodeState: opts.writeCustomNodeState,
    getCustomNodeDefinition: opts.getCustomNodeDefinition,
    upsertCustomNodeDefinition: opts.upsertCustomNodeDefinition,
    customNodeDefinitions: opts.customNodeDefinitions,
    definitionsInCycles: opts.definitionsInCycles,
    buildGroupPortIndex: opts.buildGroupPortIndex,
    groupIdFromNode: opts.groupIdFromNode,
    isGroupPortNodeType: opts.isGroupPortNodeType,
    deepestGroupIdContainingNode: opts.deepestGroupIdContainingNode,
    syncCoupledCustomNodesForDefinition,
    materializeInternalNodeId: opts.materializeInternalNodeId,
    isMaterializedInternalNodeId: opts.isMaterializedInternalNodeId,
    internalNodeIdFromMaterialized: opts.internalNodeIdFromMaterialized,
    customNodeIdFromMaterializedNodeId: opts.customNodeIdFromMaterializedNodeId,
  });

  opts.setExpandedCustomGroupIds(customNodeExpansion.getExpandedGroupIds());

  return {
    ...customNodeHandlers,
    refreshExpandedCustomGroupIds,
    rehydrateExpandedCustomFrames: customNodeExpansion.rehydrateExpandedCustomFrames,
    handleExpandCustomNode: customNodeExpansion.handleExpandCustomNode,
    handleCollapseCustomNodeFrame: customNodeExpansion.handleCollapseCustomNodeFrame,
  };
}
