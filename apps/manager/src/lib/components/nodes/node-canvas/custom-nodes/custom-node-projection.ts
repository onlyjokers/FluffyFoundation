// Purpose: Build editor-only Custom Node projection graphs without mutating canonical NodeEngine state.
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';

export const CUSTOM_NODE_PROJECTION_PREFIX = 'view:custom:' as const;

export const isCustomNodeProjectionId = (id: string): boolean =>
  String(id ?? '').startsWith(CUSTOM_NODE_PROJECTION_PREFIX);

export const customNodeProjectionNodeId = (customNodeId: string, internalNodeId: string): string =>
  `${CUSTOM_NODE_PROJECTION_PREFIX}${String(customNodeId ?? '')}:${String(internalNodeId ?? '')}`;

const customNodeProjectionConnectionId = (
  customNodeId: string,
  connectionId: string,
  index: number
): string => `${CUSTOM_NODE_PROJECTION_PREFIX}${String(customNodeId ?? '')}:conn:${String(connectionId || index)}`;

export function buildCustomNodeProjectionGraph(input: {
  customNode: NodeInstance;
  state: CustomNodeInstanceState;
  definition: CustomNodeDefinition;
}): GraphState {
  const { customNode, state } = input;
  const baseX = Number(customNode.position?.x ?? 0);
  const baseY = Number(customNode.position?.y ?? 0);
  const internal = state.internal ?? input.definition.template ?? { nodes: [], connections: [] };
  const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
  const connections = Array.isArray(internal.connections) ? internal.connections : [];

  const projectedNodes: NodeInstance[] = nodes.flatMap((node) => {
    const id = String(node?.id ?? '');
    const type = String(node?.type ?? '');
    if (!id || !type) return [];
    const position = node.position ?? { x: 0, y: 0 };
    return [
      {
        id: customNodeProjectionNodeId(String(customNode.id), id),
        type,
        position: {
          x: baseX + Number(position.x ?? 0),
          y: baseY + Number(position.y ?? 0),
        },
        config: {
          ...(node.config ?? {}),
          editorProjection: true,
          projectionOwnerNodeId: String(customNode.id),
          projectionInternalNodeId: id,
        },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      },
    ];
  });

  const projectedConnections: Connection[] = connections.flatMap((connection, index) => {
    const sourceNodeId = String(connection?.sourceNodeId ?? '');
    const sourcePortId = String(connection?.sourcePortId ?? '');
    const targetNodeId = String(connection?.targetNodeId ?? '');
    const targetPortId = String(connection?.targetPortId ?? '');
    if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];
    return [
      {
        id: customNodeProjectionConnectionId(String(customNode.id), String(connection.id ?? ''), index),
        sourceNodeId: customNodeProjectionNodeId(String(customNode.id), sourceNodeId),
        sourcePortId,
        targetNodeId: customNodeProjectionNodeId(String(customNode.id), targetNodeId),
        targetPortId,
      },
    ];
  });

  return { nodes: projectedNodes, connections: projectedConnections };
}

export function mergeProjectionGraphs(base: GraphState, projections: GraphState[]): GraphState {
  return {
    nodes: [
      ...(Array.isArray(base.nodes) ? base.nodes : []),
      ...projections.flatMap((projection) => (Array.isArray(projection.nodes) ? projection.nodes : [])),
    ],
    connections: [
      ...(Array.isArray(base.connections) ? base.connections : []),
      ...projections.flatMap((projection) =>
        Array.isArray(projection.connections) ? projection.connections : []
      ),
    ],
  };
}
