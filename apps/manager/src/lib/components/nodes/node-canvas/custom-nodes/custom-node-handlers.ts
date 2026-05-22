// Purpose: Custom-node UI handlers wired into NodeCanvas without embedding logic there.
import type { Readable } from 'svelte/store';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import { CUSTOM_NODE_TYPE_PREFIX } from '$lib/nodes/custom-nodes/store';
import type { NodeGroup } from '../controllers/group-controller';
import { asRecord } from '../../../../utils/value-guards';

type GroupController = {
  nodeGroups: Readable<NodeGroup[]>;
  toggleGroupDisabled: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
};

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void;
};

type CustomNodeActions = {
  handleUncoupleCustomNode: (nodeId: string) => void;
  handleDenodelizeGroup: (groupId: string) => void;
  handleNodelizeGroup: (groupId: string) => void;
};

type CustomNodeHandlersOptions = {
  groupController: GroupController;
  nodeEngine: NodeEngine;
  expandedCustomByGroupId: Map<string, { groupId: string; nodeId: string }>;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  writeCustomNodeState: (config: Record<string, unknown>, state: CustomNodeInstanceState) => Record<string, unknown>;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
  upsertCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  getCustomNodeActions: () => CustomNodeActions | null;
};

export const createCustomNodeHandlers = (opts: CustomNodeHandlersOptions) => {
  const handleToggleGroupDisabled = (groupId: string) => {
    const id = String(groupId ?? '');
    if (!id) return;

    const expanded = opts.expandedCustomByGroupId.get(id) ?? null;
    if (!expanded) {
      opts.groupController.toggleGroupDisabled(id);
      return;
    }
  };

  const handleRenameGroup = (groupId: string, name: string) => {
    const id = String(groupId ?? '');
    const nextName = String(name ?? '').trim();
    if (!id || !nextName) return;

    const expanded = opts.expandedCustomByGroupId.get(id) ?? null;
    if (expanded) {
      const node = opts.nodeEngine.getNode(String(expanded.nodeId ?? ''));
      const state = node ? opts.readCustomNodeState(asRecord(node.config)) : null;
      const def = state ? opts.getCustomNodeDefinition(state.definitionId) : null;
      if (def) opts.upsertCustomNodeDefinition({ ...def, name: nextName });
    }

    opts.groupController.renameGroup(id, nextName);
  };

  const syncCustomGateInputs = (state: GraphState) => {
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const connections = Array.isArray(state.connections) ? state.connections : [];
    if (nodes.length === 0) return;

    const connectedGateIds = new Set<string>();
    for (const c of connections) {
      if (String(c.targetPortId ?? '') !== 'gate') continue;
      connectedGateIds.add(String(c.targetNodeId ?? ''));
    }

    for (const node of nodes) {
      const nodeId = String(node.id ?? '');
      if (!nodeId) continue;
      if (!String(node.type ?? '').startsWith(CUSTOM_NODE_TYPE_PREFIX)) continue;
      if (connectedGateIds.has(nodeId)) continue;
      const state = opts.readCustomNodeState(asRecord(node.config));
      if (!state) continue;
      const desired = Boolean(state.manualGate);
      const current = node.inputValues?.gate;
      if (current === desired) continue;
      opts.nodeEngine.updateNodeInputValue(nodeId, 'gate', desired);
    }
  };

  const handleNodelizeGroup = (groupId: string) => {
    opts.getCustomNodeActions()?.handleNodelizeGroup(groupId);
  };

  const handleUncoupleCustomNode = (nodeId: string) => {
    opts.getCustomNodeActions()?.handleUncoupleCustomNode(nodeId);
  };

  const handleDenodelizeGroup = (groupId: string) => {
    opts.getCustomNodeActions()?.handleDenodelizeGroup(groupId);
  };

  return {
    handleToggleGroupDisabled,
    handleRenameGroup,
    syncCustomGateInputs,
    handleNodelizeGroup,
    handleUncoupleCustomNode,
    handleDenodelizeGroup,
  };
};
