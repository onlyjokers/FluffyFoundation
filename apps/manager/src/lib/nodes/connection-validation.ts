/**
 * Purpose: Pure manager-side validation helpers for graph connection edits.
 */
import type { Connection, GraphState, NodeDefinition, NodeInstance, PortType } from './types';

type GetNodeDefinition = (type: string) => NodeDefinition | undefined;

type ConnectionValidationOptions = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  connection: Connection;
  getNodeDefinition: GetNodeDefinition;
};

type LocalOnlyPatchRoutingOptions = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  getNodeDefinition: GetNodeDefinition;
};

const VALID_PORT_TYPES = new Set<string>([
  'number',
  'boolean',
  'string',
  'asset',
  'color',
  'audio',
  'image',
  'video',
  'scene',
  'effect',
  'client',
  'command',
  'fuzzy',
  'array',
  'any',
]);

const PATCH_ROOT_TYPES = new Set(['audio-out', 'image-out', 'video-out', 'effect-out', 'scene-out']);
const LOCAL_ONLY_NODE_TYPES = new Set(['load-audio-from-local', 'load-image-from-local', 'load-video-from-local']);

const resolveProxyPortType = (node: NodeInstance): PortType => {
  const configRecord =
    node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : null;
  const raw = configRecord?.portType;
  const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
  return VALID_PORT_TYPES.has(t) ? (t as PortType) : 'any';
};

const mismatchError = (sourceType: PortType, targetType: PortType, sourceNode: NodeInstance, connection: Connection) =>
  `Type mismatch: ${sourceType} -> ${targetType} (${sourceNode.id}:${connection.sourcePortId} → ${connection.targetNodeId}:${connection.targetPortId})`;

const strictMediaMismatchError = (type: 'audio' | 'image' | 'video' | 'asset', sourceNode: NodeInstance, connection: Connection) =>
  `Type mismatch: ${type} connections must be ${type} -> ${type} (${sourceNode.id}:${connection.sourcePortId} → ${connection.targetNodeId}:${connection.targetPortId})`;

export function getConnectionValidationError({
  graph,
  connection,
  getNodeDefinition,
}: ConnectionValidationOptions): string | null {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];

  const inputAlreadyConnected = connections.some(
    (c) => c.targetNodeId === connection.targetNodeId && c.targetPortId === connection.targetPortId
  );
  if (inputAlreadyConnected) return 'The "in port" is connected up to once';

  const sourceNode = nodes.find((n) => n.id === connection.sourceNodeId);
  const targetNode = nodes.find((n) => n.id === connection.targetNodeId);
  if (!sourceNode || !targetNode) return 'Connection failed';

  if (sourceNode.type === 'group-proxy' && connection.sourcePortId === 'out') {
    const sourceConfig =
      sourceNode.config && typeof sourceNode.config === 'object'
        ? (sourceNode.config as Record<string, unknown>)
        : null;
    const direction = String(sourceConfig?.direction ?? 'output');
    if (direction === 'output') {
      const alreadyConnected = connections.some(
        (c) => c.sourceNodeId === connection.sourceNodeId && c.sourcePortId === connection.sourcePortId
      );
      if (alreadyConnected) return 'Group proxy output can only be connected once';
    }
  }

  const sourceDef = getNodeDefinition(sourceNode.type);
  const targetDef = getNodeDefinition(targetNode.type);
  const sourcePort = sourceDef?.outputs.find((p) => p.id === connection.sourcePortId);
  const targetPort = targetDef?.inputs.find((p) => p.id === connection.targetPortId);

  if (!sourcePort || !targetPort) return 'Connection failed';

  let sourceType = (sourcePort.type ?? 'any') as PortType;
  let targetType = (targetPort.type ?? 'any') as PortType;

  if (sourceNode.type === 'group-proxy') sourceType = resolveProxyPortType(sourceNode);
  if (targetNode.type === 'group-proxy') targetType = resolveProxyPortType(targetNode);

  if (sourceNode.type === 'logic-sleep' && sourcePort.id === 'output') {
    const inputConn = connections.find(
      (c) => c.targetNodeId === sourceNode.id && c.targetPortId === 'input'
    );
    if (!inputConn) return 'Sleep output requires a connected input.';
    const inputSourceNode = nodes.find((n) => n.id === inputConn.sourceNodeId);
    const inputSourceDef = inputSourceNode ? getNodeDefinition(inputSourceNode.type) : null;
    const inputSourcePort = inputSourceDef?.outputs.find((p) => p.id === inputConn.sourcePortId);
    sourceType = (inputSourcePort?.type ?? 'any') as PortType;
  }

  if (sourceType !== 'any' && targetType !== 'any' && sourceType !== targetType) {
    return mismatchError(sourceType, targetType, sourceNode, connection);
  }

  if (sourceType === 'audio' || targetType === 'audio') {
    if (sourceType !== 'audio' || targetType !== 'audio') {
      return strictMediaMismatchError('audio', sourceNode, connection);
    }
  }
  if (sourceType === 'image' || targetType === 'image') {
    if (sourceType !== 'image' || targetType !== 'image') {
      return strictMediaMismatchError('image', sourceNode, connection);
    }
  }
  if (sourceType === 'video' || targetType === 'video') {
    if (sourceType !== 'video' || targetType !== 'video') {
      return strictMediaMismatchError('video', sourceNode, connection);
    }
  }
  if (sourceType === 'asset' || targetType === 'asset') {
    if (sourceType !== 'asset' || targetType !== 'asset') {
      return strictMediaMismatchError('asset', sourceNode, connection);
    }
  }

  return null;
}

export function getLocalOnlyPatchRoutingError({
  graph,
  getNodeDefinition,
}: LocalOnlyPatchRoutingOptions): string | null {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];

  const nodeById = new Map(nodes.map((n) => [String(n.id), n]));
  const typeById = new Map(nodes.map((n) => [String(n.id), String(n.type)]));

  const patchRoots = nodes.filter((n) => PATCH_ROOT_TYPES.has(String(n.type)));
  if (patchRoots.length === 0) return null;

  const incomingByTarget = new Map<string, { sourceNodeId: string; targetPortId: string }[]>();
  const outgoingBySourceKey = new Map<string, { targetNodeId: string; targetPortId: string }[]>();
  for (const c of connections) {
    const targetNodeId = String(c.targetNodeId);
    const sourceNodeId = String(c.sourceNodeId);
    const targetPortId = String(c.targetPortId);
    const sourcePortId = String(c.sourcePortId);

    const incoming = incomingByTarget.get(targetNodeId) ?? [];
    incoming.push({ sourceNodeId, targetPortId });
    incomingByTarget.set(targetNodeId, incoming);

    const sourceKey = `${sourceNodeId}:${sourcePortId}`;
    const outgoing = outgoingBySourceKey.get(sourceKey) ?? [];
    outgoing.push({ targetNodeId, targetPortId });
    outgoingBySourceKey.set(sourceKey, outgoing);
  }

  const shouldTraverseComputeDependency = (targetNodeId: string, targetPortId: string): boolean => {
    const node = nodeById.get(String(targetNodeId));
    if (!node) return true;
    const def = getNodeDefinition(String(node.type));
    const port = def?.inputs?.find((p) => String(p.id) === String(targetPortId));
    const portType = (port?.type ?? 'any') as PortType;
    return portType !== 'client' && portType !== 'command';
  };

  const rootContainsLocalOnlyNodes = (rootNodeId: string): boolean => {
    const keep = new Set<string>();
    const visit = (nodeId: string) => {
      const id = String(nodeId);
      if (!id || keep.has(id)) return;
      const node = nodeById.get(id);
      if (!node) return;
      keep.add(id);
      const incoming = incomingByTarget.get(id) ?? [];
      for (const inc of incoming) {
        if (!shouldTraverseComputeDependency(id, inc.targetPortId)) continue;
        visit(inc.sourceNodeId);
      }
    };
    visit(rootNodeId);
    for (const id of keep) {
      const type = String(typeById.get(id) ?? '');
      if (LOCAL_ONLY_NODE_TYPES.has(type)) return true;
    }
    return false;
  };

  const getCommandOutputPorts = (type: string): string[] => {
    const def = getNodeDefinition(String(type));
    return (def?.outputs ?? []).filter((p) => String(p.type) === 'command').map((p) => String(p.id));
  };

  const isCommandInputPort = (type: string, portId: string): boolean => {
    const def = getNodeDefinition(String(type));
    const port = (def?.inputs ?? []).find((p) => String(p.id) === String(portId));
    return Boolean(port) && String(port?.type) === 'command';
  };

  const rootRoutesToClientObject = (rootNodeId: string): boolean => {
    const rootType = String(typeById.get(rootNodeId) ?? '');
    if (!rootType) return false;

    const queue: { nodeId: string; portId: string }[] = getCommandOutputPorts(rootType).map((portId) => ({
      nodeId: rootNodeId,
      portId,
    }));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nextHop = queue.shift()!;
      const key = `${nextHop.nodeId}:${nextHop.portId}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const outgoing = outgoingBySourceKey.get(key) ?? [];
      for (const c of outgoing) {
        const targetNodeId = String(c.targetNodeId);
        if (!targetNodeId) continue;
        const targetPortId = String(c.targetPortId);
        const targetType = String(typeById.get(targetNodeId) ?? '');
        if (!targetType) continue;
        if (!isCommandInputPort(targetType, targetPortId)) continue;

        if (targetType === 'client-object') return true;
        if (targetType === 'display-object') continue;

        for (const outPortId of getCommandOutputPorts(targetType)) {
          queue.push({ nodeId: targetNodeId, portId: outPortId });
        }
      }
    }

    return false;
  };

  for (const root of patchRoots) {
    const rootId = String(root.id);
    if (!rootId) continue;
    if (!rootContainsLocalOnlyNodes(rootId)) continue;
    if (rootRoutesToClientObject(rootId)) {
      return 'Load * From Local(Display) can only connect Deploy to Display (not Client).';
    }
  }

  return null;
}
