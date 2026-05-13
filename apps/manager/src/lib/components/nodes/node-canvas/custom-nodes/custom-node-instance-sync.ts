// Purpose: Keep coupled Custom Node instances aligned with their current definition.
import { asRecord } from '$lib/utils/value-guards';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';

type NodeEngineLike = {
  exportGraph: () => GraphState;
  getNode: (id: string) => NodeInstance | undefined;
  removeConnection: (id: string) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
};

type CustomNodeInstanceSyncOptions = {
  nodeEngine: NodeEngineLike;
  customNodeType: (definitionId: string) => string;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | undefined;
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
};

export function createCustomNodeInstanceSync(opts: CustomNodeInstanceSyncOptions) {
  return (definitionId: string) => {
    const id = String(definitionId ?? '');
    if (!id) return;

    const def = opts.getCustomNodeDefinition(id);
    if (!def) return;

    const graph = opts.nodeEngine.exportGraph();
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph.connections) ? graph.connections : [];

    const type = opts.customNodeType(id);
    const instanceNodeIds = new Set<string>();
    for (const node of nodes) {
      if (String(node.type ?? '') !== type) continue;
      instanceNodeIds.add(String(node.id ?? ''));
    }

    const validPortIds = new Set<string>([
      'gate',
      ...(def.ports ?? []).map((p) => String(p?.portKey ?? '')).filter(Boolean),
    ]);

    for (const c of connections) {
      const connId = String(c.id ?? '');
      if (!connId) continue;

      const sourceNodeId = String(c.sourceNodeId ?? '');
      const sourcePortId = String(c.sourcePortId ?? '');
      const targetNodeId = String(c.targetNodeId ?? '');
      const targetPortId = String(c.targetPortId ?? '');

      const invalidSource = instanceNodeIds.has(sourceNodeId) && !validPortIds.has(sourcePortId);
      const invalidTarget = instanceNodeIds.has(targetNodeId) && !validPortIds.has(targetPortId);
      if (invalidSource || invalidTarget) opts.nodeEngine.removeConnection(connId);
    }

    for (const nodeId of instanceNodeIds) {
      const node = opts.nodeEngine.getNode(String(nodeId));
      if (!node) continue;
      const state = opts.readCustomNodeState(asRecord(node.config));
      if (!state || state.role !== 'child') continue;

      const nextInternal = opts.syncCustomNodeInternalGraph({
        current: state.internal,
        template: def.template,
        instanceGroupId: state.groupId,
      });

      opts.nodeEngine.updateNodeConfig(
        nodeId,
        opts.writeCustomNodeState(asRecord(node.config), { ...state, internal: nextInternal })
      );
    }

    // Also sync nested occurrences inside other Custom Node instances' internal graphs.
    for (const node of nodes) {
      const nodeId = String(node.id ?? '');
      if (!nodeId) continue;
      const instance = opts.nodeEngine.getNode(nodeId);
      if (!instance) continue;
      const state = opts.readCustomNodeState(asRecord(instance.config));
      if (!state) continue;

      const nested = opts.syncNestedCustomNodesToDefinition({
        graph: state.internal,
        definitionId: id,
        definitionTemplate: def.template,
      });
      if (!nested.changed) continue;

      opts.nodeEngine.updateNodeConfig(
        nodeId,
        opts.writeCustomNodeState(asRecord(instance.config), { ...state, internal: nested.graph })
      );
    }
  };
}
