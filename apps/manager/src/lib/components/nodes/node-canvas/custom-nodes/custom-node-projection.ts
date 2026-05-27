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

export const customNodeProjectionGroupId = (customNodeId: string, internalGroupId: string): string =>
  `${CUSTOM_NODE_PROJECTION_PREFIX}${String(customNodeId ?? '')}:group:${String(internalGroupId ?? '')}`;

const cloneInternalGroups = (internal: GraphState | null | undefined): GraphState['groups'] | undefined =>
  Array.isArray(internal?.groups)
    ? internal.groups.map((group) => ({
        ...group,
        nodeIds: Array.isArray(group?.nodeIds) ? group.nodeIds.map(String) : [],
      }))
    : undefined;

const cloneInternalGraph = (input: {
  internal: GraphState;
  nodes: NodeInstance[];
  connections?: Connection[];
}): GraphState => {
  const groups = cloneInternalGroups(input.internal);
  return {
    nodes: input.nodes,
    connections: (input.connections ?? input.internal.connections ?? []).map((connection) => ({
      ...connection,
    })),
    ...(groups ? { groups } : {}),
  };
};

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

export function parseCustomNodeProjectionGroupId(
  id: string
): { customNodeId: string; internalGroupId: string } | null {
  const raw = String(id ?? '');
  if (!raw.startsWith(CUSTOM_NODE_PROJECTION_PREFIX)) return null;
  const rest = raw.slice(CUSTOM_NODE_PROJECTION_PREFIX.length);
  const marker = ':group:';
  const splitAt = rest.indexOf(marker);
  if (splitAt <= 0 || splitAt >= rest.length - marker.length) return null;
  return {
    customNodeId: rest.slice(0, splitAt),
    internalGroupId: rest.slice(splitAt + marker.length),
  };
}

export function customNodeInternalGroupIdForProjection(ownerNodeId: string, groupId: string): string {
  const parsed = parseCustomNodeProjectionGroupId(String(groupId ?? ''));
  if (!parsed) return String(groupId ?? '');
  return parsed.customNodeId === String(ownerNodeId ?? '') ? parsed.internalGroupId : String(groupId ?? '');
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
    internal: cloneInternalGraph({
      internal,
      nodes: nextNodes,
    }),
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

function normalizeProjectionNodeForInternal(ownerId: string, node: NodeInstance): NodeInstance {
  const config = { ...(node.config ?? {}) };
  if (String(node.type ?? '') === 'group-proxy' || String(node.type ?? '') === 'group-gate') {
    const rawGroupId = String(config.groupId ?? '');
    if (rawGroupId) config.groupId = customNodeInternalGroupIdForProjection(ownerId, rawGroupId);
  }
  delete config.editorProjection;
  delete config.projectionOwnerNodeId;
  delete config.projectionInternalNodeId;
  return { ...node, config };
}

export function appendCustomNodeProjectionNode(input: {
  ownerNodeId: string;
  node: NodeInstance;
  ownerViewPosition?: { x: number; y: number } | null;
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
      const ownerX = Number(input.ownerViewPosition?.x ?? owner.position?.x ?? 0);
      const ownerY = Number(input.ownerViewPosition?.y ?? owner.position?.y ?? 0);
      const x = Number(input.node.position?.x ?? ownerX);
      const y = Number(input.node.position?.y ?? ownerY);
      const internalNode = normalizeProjectionNodeForInternal(ownerId, input.node);
      return {
        ...state,
        internal: cloneInternalGraph({
          internal,
          nodes: [
            ...nodes.map((node) => ({ ...node })),
            {
              ...internalNode,
              id: nodeId,
              type,
              position: {
                x: Number.isFinite(x) ? x - ownerX : 0,
                y: Number.isFinite(y) ? y - ownerY : 0,
              },
              config: { ...(internalNode.config ?? {}) },
              inputValues: { ...(internalNode.inputValues ?? {}) },
              outputValues: {},
            },
          ],
        }),
      };
    },
  });

  return ok ? customNodeProjectionNodeId(ownerId, nodeId) : undefined;
}

export function removeCustomNodeProjectionNode(input: {
  projectionNodeId: string;
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
    mutate: (state) => {
      const internal = state.internal ?? { nodes: [], connections: [] };
      const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
      if (!nodes.some((node) => String(node?.id ?? '') === internalNodeId)) return null;

      const connections = Array.isArray(internal.connections) ? internal.connections : [];
      const groups = Array.isArray(internal.groups)
        ? internal.groups
            .map((group) => ({
              ...group,
              nodeIds: (Array.isArray(group?.nodeIds) ? group.nodeIds : [])
                .map(String)
                .filter((nodeId) => nodeId !== internalNodeId),
            }))
            .filter((group) => (group.nodeIds ?? []).length > 0)
        : undefined;

      return {
        ...state,
        internal: {
          nodes: nodes.filter((node) => String(node?.id ?? '') !== internalNodeId).map((node) => ({ ...node })),
          connections: connections
            .filter(
              (connection) =>
                String(connection?.sourceNodeId ?? '') !== internalNodeId &&
                String(connection?.targetNodeId ?? '') !== internalNodeId
            )
            .map((connection) => ({ ...connection })),
          ...(groups && groups.length > 0 ? { groups } : {}),
        },
      };
    },
  });
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

function resolvePortDef(
  nodeRegistry: {
    get: (type: string) =>
      | { inputs?: { id: string; label?: string; type?: string }[]; outputs?: { id: string; label?: string; type?: string }[] }
      | undefined;
  },
  nodeType: string,
  side: 'input' | 'output',
  portId: string
): { label: string; type: string } {
  const def = nodeRegistry.get(String(nodeType ?? ''));
  const ports = side === 'input' ? def?.inputs : def?.outputs;
  const port = (ports ?? []).find((candidate) => String(candidate.id) === String(portId)) ?? null;
  return { label: String(port?.label ?? portId), type: String(port?.type ?? 'any') };
}

function resolveProxyBoundaryPortMeta(input: {
  proxyId: string;
  side: 'input' | 'output';
  fallbackType: string;
  connections: Connection[];
  nodeById: Map<string, NodeInstance>;
  nodeRegistry: Parameters<typeof resolvePortDef>[0];
}): { label: string; type: string } {
  const visited = new Set<string>();
  const resolveInput = (proxyId: string): { label: string; type: string } => {
    if (visited.has(`in:${proxyId}`)) return { label: 'In', type: input.fallbackType };
    visited.add(`in:${proxyId}`);
    const inner = input.connections.find(
      (connection) => String(connection.sourceNodeId) === proxyId && String(connection.sourcePortId) === 'out'
    );
    if (!inner) return { label: 'In', type: input.fallbackType };
    const targetNode = input.nodeById.get(String(inner.targetNodeId));
    if (!targetNode) return { label: String(inner.targetPortId ?? 'In'), type: input.fallbackType };
    if (String(targetNode.type ?? '') === 'group-proxy' && String(inner.targetPortId ?? '') === 'in') {
      return resolveInput(String(targetNode.id ?? ''));
    }
    return resolvePortDef(
      input.nodeRegistry,
      String(targetNode.type),
      'input',
      String(inner.targetPortId)
    );
  };

  const resolveOutput = (proxyId: string): { label: string; type: string } => {
    if (visited.has(`out:${proxyId}`)) return { label: 'Out', type: input.fallbackType };
    visited.add(`out:${proxyId}`);
    const inner = input.connections.find(
      (connection) => String(connection.targetNodeId) === proxyId && String(connection.targetPortId) === 'in'
    );
    if (!inner) return { label: 'Out', type: input.fallbackType };
    const sourceNode = input.nodeById.get(String(inner.sourceNodeId));
    if (!sourceNode) return { label: String(inner.sourcePortId ?? 'Out'), type: input.fallbackType };
    if (String(sourceNode.type ?? '') === 'group-proxy' && String(inner.sourcePortId ?? '') === 'out') {
      return resolveOutput(String(sourceNode.id ?? ''));
    }
    return resolvePortDef(
      input.nodeRegistry,
      String(sourceNode.type),
      'output',
      String(inner.sourcePortId)
    );
  };

  return input.side === 'input' ? resolveInput(input.proxyId) : resolveOutput(input.proxyId);
}

export function refreshCustomNodeProjectionPorts(input: {
  definition: CustomNodeDefinition;
  ownerNode: NodeInstance;
  nodeRegistry: {
    get: (type: string) =>
      | { inputs?: { id: string; label?: string; type?: string }[]; outputs?: { id: string; label?: string; type?: string }[] }
      | undefined;
  };
}): CustomNodeDefinition | null {
  const owner = input.ownerNode;
  const state = readCustomNodeState(owner.config ?? {});
  if (!state) return null;

  const ownerId = String(owner.id ?? '');
  const ownerGroupId = String(state.groupId ?? '');
  const ownerY = Number(owner.position?.y ?? 0);
  const internal = state.internal ?? { nodes: [], connections: [] };
  const nodes = Array.isArray(internal.nodes) ? internal.nodes : [];
  const connections = Array.isArray(internal.connections) ? internal.connections : [];
  const nodeById = new Map(nodes.map((node) => [String(node?.id ?? ''), node] as const));

  const ports: CustomNodePort[] = nodes.flatMap((node) => {
    if (String(node?.type ?? '') !== 'group-proxy') return [];
    const nodeId = String(node?.id ?? '');
    if (!nodeId) return [];
    const config = node.config ?? {};
    const groupId = customNodeInternalGroupIdForProjection(ownerId, String(config.groupId ?? ''));
    if (ownerGroupId && groupId !== ownerGroupId) return [];

    const side: 'input' | 'output' = String(config.direction ?? 'output') === 'input' ? 'input' : 'output';
    const bindingPortId = side === 'input' ? 'in' : 'out';
    const y = Number(node.position?.y ?? ownerY) - ownerY;
    const fallbackType = String(config.portType ?? 'any') || 'any';
    const meta = resolveProxyBoundaryPortMeta({
      proxyId: nodeId,
      side,
      fallbackType,
      connections,
      nodeById,
      nodeRegistry: input.nodeRegistry,
    });

    return [
      {
        portKey: `p:${nodeId}`,
        side,
        label: meta.label,
        type: (meta.type || fallbackType) as CustomNodePort['type'],
        pinned: Boolean(config.pinned),
        y: Number.isFinite(y) ? y : 0,
        binding: { nodeId, portId: bindingPortId },
      },
    ];
  });

  return { ...input.definition, ports };
}

export function translateCustomNodeProjectionNodePosition(input: {
  projectionNodeId: string;
  position: { x: number; y: number };
  ownerViewPosition?: { x: number; y: number } | null;
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
      const ownerX = Number(input.ownerViewPosition?.x ?? owner.position?.x ?? 0);
      const ownerY = Number(input.ownerViewPosition?.y ?? owner.position?.y ?? 0);
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
        internal: cloneInternalGraph({
          internal,
          nodes: nextNodes,
        }),
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
        internal: cloneInternalGraph({
          internal,
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
        }),
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
  const groups = Array.isArray(internal.groups) ? internal.groups : [];

  const projectedNodes: NodeInstance[] = nodes.flatMap((node) => {
    const id = String(node?.id ?? '');
    const type = String(node?.type ?? '');
    if (!id || !type) return [];
    const position = node.position ?? { x: 0, y: 0 };
    const config = { ...(node.config ?? {}) };
    if (type === 'group-proxy' || type === 'group-gate') {
      const groupId = String(config.groupId ?? '');
      if (groupId) config.groupId = customNodeProjectionGroupId(String(customNode.id), groupId);
    }
    return [
      {
        id: customNodeProjectionNodeId(String(customNode.id), id),
        type,
        position: {
          x: baseX + Number(position.x ?? 0),
          y: baseY + Number(position.y ?? 0),
        },
        config: {
          ...config,
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
    ...(groups.length > 0
      ? {
          groups: groups.flatMap((group) => {
            const id = String(group?.id ?? '');
            if (!id) return [];
            const parentId = String(group?.parentId ?? '');
            const projectedId = customNodeProjectionGroupId(customNodeId, id);
            return [
              {
                id: projectedId,
                parentId: parentId
                  ? customNodeProjectionGroupId(customNodeId, parentId)
                  : null,
                name: String(group?.name ?? 'Group'),
                nodeIds: (Array.isArray(group?.nodeIds) ? group.nodeIds : [])
                  .map((nodeId) => customNodeProjectionNodeId(customNodeId, String(nodeId)))
                  .filter(Boolean),
                disabled: Boolean(group?.disabled),
                minimized: Boolean(group?.minimized),
              },
            ];
          }),
        }
      : {}),
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
    groups: [
      ...(Array.isArray(base.groups) ? base.groups : []),
      ...projections.flatMap((projection) =>
        Array.isArray(projection.groups) ? projection.groups : []
      ),
    ],
  };
}
