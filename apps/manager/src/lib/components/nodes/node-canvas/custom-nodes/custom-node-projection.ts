// Purpose: Build editor-only Custom Node projection graphs without mutating canonical NodeEngine state.
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition, CustomNodePort } from '$lib/nodes/custom-nodes/types';
import {
  readCustomNodeState,
  writeCustomNodeState,
  type CustomNodeInstanceState,
} from '$lib/nodes/custom-nodes/instance';

export const CUSTOM_NODE_PROJECTION_PREFIX = 'view:custom:' as const;

export const isCustomNodeProjectionId = (id: string): boolean =>
  String(id ?? '').startsWith(CUSTOM_NODE_PROJECTION_PREFIX);

export const customNodeProjectionNodeId = (customNodeId: string, internalNodeId: string): string =>
  `${CUSTOM_NODE_PROJECTION_PREFIX}${String(customNodeId ?? '')}:${String(internalNodeId ?? '')}`;

export function parseCustomNodeProjectionNodeId(
  id: string
): { customNodeId: string; internalNodeId: string } | null {
  const raw = String(id ?? '');
  if (!raw.startsWith(CUSTOM_NODE_PROJECTION_PREFIX)) return null;
  const rest = raw.slice(CUSTOM_NODE_PROJECTION_PREFIX.length);
  const splitAt = rest.indexOf(':');
  if (splitAt <= 0 || splitAt >= rest.length - 1) return null;
  return {
    customNodeId: rest.slice(0, splitAt),
    internalNodeId: rest.slice(splitAt + 1),
  };
}

export function resolveCustomNodeProjectionPublicConnection(input: {
  connection: Connection;
  customNode: NodeInstance;
  definition: CustomNodeDefinition;
  createConnectionId?: () => string;
}): Connection | null {
  const connection = input.connection;
  const sourceNodeId = String(connection?.sourceNodeId ?? '');
  const sourcePortId = String(connection?.sourcePortId ?? '');
  const targetNodeId = String(connection?.targetNodeId ?? '');
  const targetPortId = String(connection?.targetPortId ?? '');
  const customNodeId = String(input.customNode?.id ?? '');
  if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId || !customNodeId)
    return null;

  const sourceProjection = parseCustomNodeProjectionNodeId(sourceNodeId);
  const targetProjection = parseCustomNodeProjectionNodeId(targetNodeId);
  const nextId = () =>
    input.createConnectionId?.() ?? `conn-${crypto.randomUUID?.() ?? Date.now()}`;

  if (targetProjection?.customNodeId === customNodeId && !sourceProjection) {
    const port = (input.definition.ports ?? []).find(
      (candidate) =>
        String(candidate.side ?? '') === 'input' &&
        String(candidate.binding?.nodeId ?? '') === targetProjection.internalNodeId &&
        String(candidate.binding?.portId ?? '') === targetPortId
    );
    if (!port?.portKey) return null;
    return {
      id: nextId(),
      sourceNodeId,
      sourcePortId,
      targetNodeId: customNodeId,
      targetPortId: String(port.portKey),
    };
  }

  if (sourceProjection?.customNodeId === customNodeId && !targetProjection) {
    const port = (input.definition.ports ?? []).find(
      (candidate) =>
        String(candidate.side ?? '') === 'output' &&
        String(candidate.binding?.nodeId ?? '') === sourceProjection.internalNodeId &&
        String(candidate.binding?.portId ?? '') === sourcePortId
    );
    if (!port?.portKey) return null;
    return {
      id: nextId(),
      sourceNodeId: customNodeId,
      sourcePortId: String(port.portKey),
      targetNodeId,
      targetPortId,
    };
  }

  return null;
}

export function writeCustomNodeProjectionValue(input: {
  projectionNodeId: string;
  kind: 'input' | 'config';
  key: string;
  value: unknown;
  getOwnerNode: (nodeId: string) => NodeInstance | null | undefined;
  updateOwnerConfig: (nodeId: string, config: Record<string, unknown>) => void;
  sendSemanticNodeParams?: (nodeId: string, params: Record<string, unknown>) => boolean;
  sendNodeOverride?: (
    nodeId: string,
    kind: 'input' | 'config',
    portId: string,
    value: unknown
  ) => void;
}): boolean {
  const projection = parseCustomNodeProjectionNodeId(String(input.projectionNodeId ?? ''));
  if (!projection) return false;
  const ownerId = String(projection.customNodeId ?? '');
  const internalNodeId = String(projection.internalNodeId ?? '');
  const key = String(input.key ?? '');
  if (!ownerId || !internalNodeId || !key) return false;

  const owner = input.getOwnerNode(ownerId);
  const state = owner ? readCustomNodeState(owner.config ?? {}) : null;
  if (!owner || !state) return false;

  const internal = state.internal ?? { nodes: [], connections: [] };
  const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (String(node?.id ?? '') !== internalNodeId) return node;
    changed = true;
    if (input.kind === 'input') {
      return {
        ...node,
        inputValues: { ...(node.inputValues ?? {}), [key]: input.value },
      };
    }
    return {
      ...node,
      config: { ...(node.config ?? {}), [key]: input.value },
    };
  });

  if (!changed) return false;

  const nextState: CustomNodeInstanceState = {
    ...state,
    internal: {
      nodes: nextNodes,
      connections: (internal.connections ?? []).map((connection) => ({ ...connection })),
    },
  };
  const nextConfig = writeCustomNodeState(owner.config ?? {}, nextState);
  input.updateOwnerConfig(ownerId, nextConfig);
  input.sendSemanticNodeParams?.(ownerId, nextConfig);
  input.sendNodeOverride?.(`cn:${ownerId}:${internalNodeId}`, input.kind, key, input.value);
  return true;
}

function updateCustomNodeProjectionState(input: {
  ownerNodeId: string;
  getOwnerNode: (nodeId: string) => NodeInstance | null | undefined;
  updateOwnerConfig: (nodeId: string, config: Record<string, unknown>) => void;
  mutate: (state: CustomNodeInstanceState, owner: NodeInstance) => CustomNodeInstanceState | null;
}): boolean {
  const ownerId = String(input.ownerNodeId ?? '');
  if (!ownerId) return false;
  const owner = input.getOwnerNode(ownerId);
  const state = owner ? readCustomNodeState(owner.config ?? {}) : null;
  if (!owner || !state) return false;

  const nextState = input.mutate(state, owner);
  if (!nextState) return false;
  input.updateOwnerConfig(ownerId, writeCustomNodeState(owner.config ?? {}, nextState));
  return true;
}

export function appendCustomNodeProjectionNode(input: {
  ownerNodeId: string;
  node: NodeInstance;
  getOwnerNode: (nodeId: string) => NodeInstance | null | undefined;
  updateOwnerConfig: (nodeId: string, config: Record<string, unknown>) => void;
}): string | undefined {
  const ownerId = String(input.ownerNodeId ?? '');
  const nodeId = String(input.node?.id ?? '');
  const type = String(input.node?.type ?? '');
  if (!ownerId || !nodeId || !type) return undefined;

  const ok = updateCustomNodeProjectionState({
    ownerNodeId: ownerId,
    getOwnerNode: input.getOwnerNode,
    updateOwnerConfig: input.updateOwnerConfig,
    mutate: (state, owner) => {
      const internal = state.internal ?? { nodes: [], connections: [] };
      const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
      if (nodes.some((node) => String(node?.id ?? '') === nodeId)) return null;
      const ownerX = Number(owner.position?.x ?? 0);
      const ownerY = Number(owner.position?.y ?? 0);
      const x = Number(input.node.position?.x ?? ownerX);
      const y = Number(input.node.position?.y ?? ownerY);
      return {
        ...state,
        internal: {
          nodes: [
            ...nodes.map((node) => ({ ...node })),
            {
              ...input.node,
              id: nodeId,
              type,
              position: {
                x: Number.isFinite(x) ? x - ownerX : 0,
                y: Number.isFinite(y) ? y - ownerY : 0,
              },
              config: { ...(input.node.config ?? {}) },
              inputValues: { ...(input.node.inputValues ?? {}) },
              outputValues: {},
            },
          ],
          connections: (internal.connections ?? []).map((connection) => ({ ...connection })),
        },
      };
    },
  });

  return ok ? customNodeProjectionNodeId(ownerId, nodeId) : undefined;
}

export function upsertCustomNodeProjectionPort(input: {
  definition: CustomNodeDefinition;
  node: NodeInstance;
  ownerNode: NodeInstance;
  label?: string;
}): CustomNodeDefinition | null {
  const definition = input.definition;
  const node = input.node;
  if (String(node?.type ?? '') !== 'group-proxy') return null;
  const nodeId = String(node?.id ?? '');
  if (!nodeId) return null;
  const config = node.config ?? {};
  const direction = String(config.direction ?? 'output') === 'input' ? 'input' : 'output';
  const portKey = `p:${nodeId}`;
  const bindingPortId = direction === 'input' ? 'in' : 'out';
  const ownerY = Number(input.ownerNode?.position?.y ?? 0);
  const nodeY = Number(node.position?.y ?? ownerY);
  const port: CustomNodePort = {
    portKey,
    side: direction,
    label: String(input.label ?? (direction === 'input' ? 'In' : 'Out')),
    type: (String(config.portType ?? 'any') || 'any') as CustomNodePort['type'],
    pinned: Boolean(config.pinned),
    y: Number.isFinite(nodeY) ? nodeY - ownerY : 0,
    binding: { nodeId, portId: bindingPortId },
  };
  const ports = Array.isArray(definition.ports) ? definition.ports : [];
  const nextPorts = ports.some((candidate) => String(candidate?.portKey ?? '') === portKey)
    ? ports.map((candidate) => (String(candidate?.portKey ?? '') === portKey ? port : candidate))
    : [...ports, port];
  return {
    ...definition,
    ports: nextPorts,
  };
}

export function translateCustomNodeProjectionNodePosition(input: {
  projectionNodeId: string;
  position: { x: number; y: number };
  getOwnerNode: (nodeId: string) => NodeInstance | null | undefined;
  updateOwnerConfig: (nodeId: string, config: Record<string, unknown>) => void;
}): boolean {
  const projection = parseCustomNodeProjectionNodeId(String(input.projectionNodeId ?? ''));
  if (!projection) return false;
  const ownerId = String(projection.customNodeId ?? '');
  const internalNodeId = String(projection.internalNodeId ?? '');
  if (!ownerId || !internalNodeId) return false;

  return updateCustomNodeProjectionState({
    ownerNodeId: ownerId,
    getOwnerNode: input.getOwnerNode,
    updateOwnerConfig: input.updateOwnerConfig,
    mutate: (state, owner) => {
      const internal = state.internal ?? { nodes: [], connections: [] };
      const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
      const ownerX = Number(owner.position?.x ?? 0);
      const ownerY = Number(owner.position?.y ?? 0);
      const x = Number(input.position?.x);
      const y = Number(input.position?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      let changed = false;
      const nextNodes = nodes.map((node) => {
        if (String(node?.id ?? '') !== internalNodeId) return { ...node };
        changed = true;
        return {
          ...node,
          position: { x: x - ownerX, y: y - ownerY },
        };
      });
      if (!changed) return null;
      return {
        ...state,
        internal: {
          nodes: nextNodes,
          connections: (internal.connections ?? []).map((connection) => ({ ...connection })),
        },
      };
    },
  });
}

export function appendCustomNodeProjectionConnection(input: {
  connection: Connection;
  getOwnerNode: (nodeId: string) => NodeInstance | null | undefined;
  updateOwnerConfig: (nodeId: string, config: Record<string, unknown>) => void;
  createConnectionId?: () => string;
}): boolean {
  const source = parseCustomNodeProjectionNodeId(String(input.connection?.sourceNodeId ?? ''));
  const target = parseCustomNodeProjectionNodeId(String(input.connection?.targetNodeId ?? ''));
  if (!source || !target) return false;
  if (source.customNodeId !== target.customNodeId) return false;
  const ownerId = String(source.customNodeId ?? '');
  const sourceNodeId = String(source.internalNodeId ?? '');
  const targetNodeId = String(target.internalNodeId ?? '');
  const sourcePortId = String(input.connection?.sourcePortId ?? '');
  const targetPortId = String(input.connection?.targetPortId ?? '');
  if (!ownerId || !sourceNodeId || !targetNodeId || !sourcePortId || !targetPortId) return false;

  return updateCustomNodeProjectionState({
    ownerNodeId: ownerId,
    getOwnerNode: input.getOwnerNode,
    updateOwnerConfig: input.updateOwnerConfig,
    mutate: (state) => {
      const internal = state.internal ?? { nodes: [], connections: [] };
      const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
      const nodeIds = new Set(nodes.map((node) => String(node?.id ?? '')).filter(Boolean));
      if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) return null;
      const connections = Array.isArray(internal.connections) ? internal.connections : [];
      const duplicate = connections.some(
        (connection) =>
          String(connection?.sourceNodeId ?? '') === sourceNodeId &&
          String(connection?.sourcePortId ?? '') === sourcePortId &&
          String(connection?.targetNodeId ?? '') === targetNodeId &&
          String(connection?.targetPortId ?? '') === targetPortId
      );
      if (duplicate) return null;
      const id =
        input.createConnectionId?.() ??
        `conn-${crypto.randomUUID?.() ?? Date.now()}`;
      return {
        ...state,
        internal: {
          nodes: nodes.map((node) => ({ ...node })),
          connections: [
            ...connections.map((connection) => ({ ...connection })),
            {
              id,
              sourceNodeId,
              sourcePortId,
              targetNodeId,
              targetPortId,
            },
          ],
        },
      };
    },
  });
}

const customNodeProjectionConnectionId = (
  customNodeId: string,
  connectionId: string,
  index: number
): string =>
  `${CUSTOM_NODE_PROJECTION_PREFIX}${String(customNodeId ?? '')}:conn:${String(connectionId || index)}`;

export function buildCustomNodeProjectionGraph(input: {
  customNode: NodeInstance;
  state: CustomNodeInstanceState;
  definition: CustomNodeDefinition;
  externalConnections?: Connection[];
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
        id: customNodeProjectionConnectionId(
          String(customNode.id),
          String(connection.id ?? ''),
          index
        ),
        sourceNodeId: customNodeProjectionNodeId(String(customNode.id), sourceNodeId),
        sourcePortId,
        targetNodeId: customNodeProjectionNodeId(String(customNode.id), targetNodeId),
        targetPortId,
      },
    ];
  });

  const customNodeId = String(customNode.id ?? '');
  const externalConnections = Array.isArray(input.externalConnections)
    ? input.externalConnections
    : [];
  const portByKey = new Map(
    (input.definition.ports ?? []).map((port) => [String(port.portKey ?? ''), port] as const)
  );
  const projectedExternalConnections: Connection[] = externalConnections.flatMap(
    (connection, index) => {
      const sourceNodeId = String(connection?.sourceNodeId ?? '');
      const sourcePortId = String(connection?.sourcePortId ?? '');
      const targetNodeId = String(connection?.targetNodeId ?? '');
      const targetPortId = String(connection?.targetPortId ?? '');
      if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];

      if (targetNodeId === customNodeId) {
        const port = portByKey.get(targetPortId) ?? null;
        if (!port || port.side !== 'input') return [];
        const bindingNodeId = String(port.binding?.nodeId ?? '');
        const bindingPortId = String(port.binding?.portId ?? '');
        if (!bindingNodeId || !bindingPortId) return [];
        return [
          {
            id: customNodeProjectionConnectionId(
              customNodeId,
              `external-in:${connection.id ?? index}`,
              index
            ),
            sourceNodeId,
            sourcePortId,
            targetNodeId: customNodeProjectionNodeId(customNodeId, bindingNodeId),
            targetPortId: bindingPortId,
          },
        ];
      }

      if (sourceNodeId === customNodeId) {
        const port = portByKey.get(sourcePortId) ?? null;
        if (!port || port.side !== 'output') return [];
        const bindingNodeId = String(port.binding?.nodeId ?? '');
        const bindingPortId = String(port.binding?.portId ?? '');
        if (!bindingNodeId || !bindingPortId) return [];
        return [
          {
            id: customNodeProjectionConnectionId(
              customNodeId,
              `external-out:${connection.id ?? index}`,
              index
            ),
            sourceNodeId: customNodeProjectionNodeId(customNodeId, bindingNodeId),
            sourcePortId: bindingPortId,
            targetNodeId,
            targetPortId,
          },
        ];
      }

      return [];
    }
  );

  return {
    nodes: projectedNodes,
    connections: [...projectedConnections, ...projectedExternalConnections],
  };
}

export function mergeProjectionGraphs(base: GraphState, projections: GraphState[]): GraphState {
  return {
    nodes: [
      ...(Array.isArray(base.nodes) ? base.nodes : []),
      ...projections.flatMap((projection) =>
        Array.isArray(projection.nodes) ? projection.nodes : []
      ),
    ],
    connections: [
      ...(Array.isArray(base.connections) ? base.connections : []),
      ...projections.flatMap((projection) =>
        Array.isArray(projection.connections) ? projection.connections : []
      ),
    ],
  };
}
