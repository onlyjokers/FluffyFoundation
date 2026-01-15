// Purpose: Pure helpers for cloning custom node graph templates.
import type { GraphState, NodeInstance, Connection } from '$lib/nodes/types';

export function cloneGraphState(graph: GraphState): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];

  const clonedNodes: NodeInstance[] = nodes.map((node) => ({
    ...node,
    config: { ...(node.config ?? {}) },
    inputValues: { ...(node.inputValues ?? {}) },
    outputValues: {},
  }));

  const clonedConnections: Connection[] = connections.map((conn) => ({ ...conn }));

  return { nodes: clonedNodes, connections: clonedConnections };
}
