/**
 * Purpose: Sync helpers for Phase 2.5 Custom Nodes.
 *
 * This module keeps coupled child instances structurally in sync with their
 * Custom Node definition template while preserving per-instance parameters.
 */
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { cloneInternalGraphForNewInstance, generateCustomNodeGroupId, readCustomNodeState, writeCustomNodeState } from './instance';
import type { CustomNodeInstanceState } from './instance';

const isGroupAwareInternalNodeType = (type: string) => type === 'group-proxy' || type === 'group-gate';

const cloneTemplateNodeForInstance = (node: NodeInstance, instanceGroupId: string): NodeInstance => {
  const type = String(node.type ?? '');
  let config: Record<string, unknown> = { ...(node.config ?? {}) };
  const inputValues: Record<string, unknown> = { ...(node.inputValues ?? {}) };

  if (isGroupAwareInternalNodeType(type)) {
    config = { ...config, groupId: String(instanceGroupId) };
  }

  const nested = readCustomNodeState(config);
  if (!nested) {
    return { ...node, config, inputValues, outputValues: {} };
  }

  const nestedGroupId = generateCustomNodeGroupId();
  const nextNested: CustomNodeInstanceState = {
    ...nested,
    role: 'child',
    groupId: nestedGroupId,
    internal: cloneInternalGraphForNewInstance(nested.internal, nestedGroupId),
  };

  return {
    ...node,
    config: writeCustomNodeState(config, nextNested),
    inputValues,
    outputValues: {},
  };
};

export function syncCustomNodeInternalGraph(opts: {
  current: GraphState;
  template: GraphState;
  instanceGroupId: string;
}): GraphState {
  const currentNodes = Array.isArray(opts.current?.nodes) ? opts.current.nodes : [];
  const currentById = new Map(currentNodes.map((n) => [String(n.id), n] as const));

  const templateNodes = Array.isArray(opts.template?.nodes) ? opts.template.nodes : [];
  const nextNodes: NodeInstance[] = [];

  for (const node of templateNodes) {
    const id = String(node?.id ?? '');
    if (!id) continue;

    const templateType = String(node.type ?? '');
    const currentNode = currentById.get(id) as NodeInstance | undefined;

    if (currentNode && String(currentNode.type ?? '') === templateType) {
      let config: Record<string, unknown> = { ...(currentNode.config ?? {}) };
      const inputValues: Record<string, unknown> = { ...(currentNode.inputValues ?? {}) };

      if (isGroupAwareInternalNodeType(templateType)) {
        // Group port nodes are structural; always follow template config (except groupId).
        config = { ...(node.config ?? {}), groupId: String(opts.instanceGroupId) };
      }

      nextNodes.push({
        ...node,
        config,
        inputValues,
        outputValues: {},
      });
      continue;
    }

    nextNodes.push(cloneTemplateNodeForInstance(node, opts.instanceGroupId));
  }

  const nodeIdSet = new Set(nextNodes.map((n) => String(n.id)));
  const templateConnections = Array.isArray(opts.template?.connections) ? opts.template.connections : [];
  const nextConnections = templateConnections
    .map((c) => ({ ...c }))
    .filter(
      (c) =>
        nodeIdSet.has(String(c.sourceNodeId ?? '')) &&
        nodeIdSet.has(String(c.targetNodeId ?? '')) &&
        Boolean(String(c.sourcePortId ?? '')) &&
        Boolean(String(c.targetPortId ?? ''))
    );

  return { nodes: nextNodes, connections: nextConnections };
}

export function syncNestedCustomNodesToDefinition(opts: {
  graph: GraphState;
  definitionId: string;
  definitionTemplate: GraphState;
}): { graph: GraphState; changed: boolean } {
  const visitedGroupIds = new Set<string>();

  const visitGraph = (graph: GraphState): { graph: GraphState; changed: boolean } => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph?.connections) ? graph.connections : [];

    let changed = false;
    const nextNodes: NodeInstance[] = [];

    for (const node of nodes) {
      const config = { ...(node.config ?? {}) };
      const state = readCustomNodeState(config);
      if (!state) {
        nextNodes.push({ ...node, config, inputValues: { ...(node.inputValues ?? {}) }, outputValues: {} });
        continue;
      }

      const groupId = String(state.groupId ?? '');
      if (groupId && visitedGroupIds.has(groupId)) {
        nextNodes.push({ ...node, config, inputValues: { ...(node.inputValues ?? {}) }, outputValues: {} });
        continue;
      }
      if (groupId) visitedGroupIds.add(groupId);

      let nextState = state;
      let internalChanged = false;

      // If this node is a child instance of the changed definition, sync its internal graph structure.
      if (state.role === 'child' && String(state.definitionId) === String(opts.definitionId)) {
        const synced = syncCustomNodeInternalGraph({
          current: state.internal,
          template: opts.definitionTemplate,
          instanceGroupId: state.groupId,
        });
        nextState = { ...state, internal: synced };
        internalChanged = true;
      }

      // Recurse into internal graph to update nested occurrences.
      const nested = visitGraph(nextState.internal);
      if (nested.changed) {
        nextState = { ...nextState, internal: nested.graph };
        internalChanged = true;
      }

      if (internalChanged) {
        changed = true;
        nextNodes.push({
          ...node,
          config: writeCustomNodeState(config, nextState),
          inputValues: { ...(node.inputValues ?? {}) },
          outputValues: {},
        });
      } else {
        nextNodes.push({ ...node, config, inputValues: { ...(node.inputValues ?? {}) }, outputValues: {} });
      }
    }

    if (!changed) return { graph, changed: false };
    return { graph: { nodes: nextNodes, connections: connections.map((c) => ({ ...c })) }, changed: true };
  };

  return visitGraph(opts.graph);
}
