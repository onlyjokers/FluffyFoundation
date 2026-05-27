// Purpose: Pure helpers for cloning custom node graph templates.
import type { GraphState, NodeInstance, Connection } from '$lib/nodes/types';
import { asRecord, getBoolean, getString } from '$lib/utils/value-guards';

type TemplateGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  minimized: boolean;
};

export function cloneGraphGroups(graph: GraphState): TemplateGroup[] {
  const groups = Array.isArray(graph?.groups) ? graph.groups : [];
  return groups.flatMap((entry) => {
    const record = asRecord(entry);
    const id = getString(record.id, '');
    if (!id) return [];
    const rawNodeIds = Array.isArray(record.nodeIds) ? record.nodeIds : [];
    const group: TemplateGroup = {
      id,
      parentId: getString(record.parentId, '') || null,
      name: getString(record.name, 'Group'),
      nodeIds: rawNodeIds.map((nodeId) => String(nodeId)).filter(Boolean),
      disabled: getBoolean(record.disabled, false),
      minimized: getBoolean(record.minimized, false),
    };
    return [group];
  });
}

export function cloneGraphState(graph: GraphState): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const groups = cloneGraphGroups(graph);

  const clonedNodes: NodeInstance[] = nodes.map((node) => ({
    ...node,
    config: { ...(node.config ?? {}) },
    inputValues: { ...(node.inputValues ?? {}) },
    outputValues: {},
  }));

  const clonedConnections: Connection[] = connections.map((conn) => ({ ...conn }));

  return {
    nodes: clonedNodes,
    connections: clonedConnections,
    ...(groups.length > 0 ? { groups } : {}),
  };
}
