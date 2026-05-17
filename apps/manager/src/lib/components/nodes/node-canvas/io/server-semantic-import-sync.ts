/**
 * Purpose: Build server semantic graph.replace commands after Manager Node Graph imports.
 */
import type { SemanticCommandPayload } from '@shugu/protocol';
import type { GraphState } from '$lib/nodes/types';
import type { NodeGroup } from '../controllers/group-controller';
import { serializeNodeGroups } from './node-graph-file.js';

export function createImportedGraphReplaceCommand(input: {
  graph: GraphState;
  groups: NodeGroup[];
}): SemanticCommandPayload & { kind: 'graph.replace'; graph: GraphState; groups: NodeGroup[] } {
  const graph: GraphState = {
    nodes: (input.graph.nodes ?? []).map((node) => ({
      ...node,
      config: { ...(node.config ?? {}) },
      inputValues: { ...(node.inputValues ?? {}) },
      outputValues: {},
    })),
    connections: (input.graph.connections ?? []).map((connection) => ({ ...connection })),
  };

  return {
    kind: 'graph.replace',
    graph,
    groups: serializeNodeGroups(input.groups ?? []),
  };
}
