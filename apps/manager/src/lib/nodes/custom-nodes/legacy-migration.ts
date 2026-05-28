// Purpose: Migrate persisted Custom Node graphs authored against older node definitions.
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition, CustomNodePort, CustomNodePortSide } from './types';
import { readCustomNodeState, writeCustomNodeState } from './instance';
import { cloneGraphGroups } from '$lib/components/nodes/node-canvas/custom-nodes/custom-node-graph';

const LEGACY_NODE_TYPE_ALIASES: Record<string, string> = {
  number: 'float',
};

const CLIENT_OBJECT_LOADER_INPUT_PORTS = new Set([
  'loadIndexs',
  'loadAll',
  'index',
  'range',
  'random',
]);

const CLIENT_OBJECT_LOADER_OUTPUT_PORTS: Record<string, string> = {
  out: 'client',
  indexs: 'indexs',
  indexOut: 'number',
};

const CUSTOM_NODE_PORT_TYPES = new Set([
  'number',
  'boolean',
  'pulse',
  'string',
  'asset',
  'color',
  'audio',
  'image',
  'video',
  'scene',
  'effect',
  'print',
  'client',
  'command',
  'fuzzy',
  'array',
  'any',
]);

const normalizeCustomPortType = (value: unknown): CustomNodePort['type'] => {
  const type = String(value ?? 'any');
  return (CUSTOM_NODE_PORT_TYPES.has(type) ? type : 'any') as CustomNodePort['type'];
};

const labelFromPortId = (value: unknown, fallback: string): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const makeUniqueNodeId = (preferred: string, used: Set<string>): string => {
  let id = preferred;
  let index = 2;
  while (used.has(id)) {
    id = `${preferred}:${index}`;
    index += 1;
  }
  used.add(id);
  return id;
};

type MigratedClientObject = {
  oldNodeId: string;
  loaderNodeId: string;
  executorNodeId: string;
};

const migrateNestedCustomState = (node: NodeInstance): NodeInstance => {
  const config = { ...(node.config ?? {}) };
  const state = readCustomNodeState(config);
  if (!state) return { ...node, type: LEGACY_NODE_TYPE_ALIASES[String(node.type ?? '')] ?? String(node.type ?? '') };

  return {
    ...node,
    type: LEGACY_NODE_TYPE_ALIASES[String(node.type ?? '')] ?? String(node.type ?? ''),
    config: writeCustomNodeState(config, {
      ...state,
      internal: normalizeLegacyCustomNodeGraph(state.internal),
    }),
  };
};

export function normalizeLegacyCustomNodeGraph(graph: GraphState): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const usedIds = new Set(nodes.map((node) => String(node?.id ?? '')).filter(Boolean));
  const migratedClients = new Map<string, MigratedClientObject>();
  const nextNodes: NodeInstance[] = [];

  for (const originalNode of nodes) {
    const node = migrateNestedCustomState(originalNode);
    const id = String(node?.id ?? '');
    const type = String(node?.type ?? '');
    if (!id || !type) continue;

    if (type !== 'client-object') {
      nextNodes.push({
        ...node,
        type,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      });
      continue;
    }

    const loaderNodeId = makeUniqueNodeId(`${id}:loader`, usedIds);
    migratedClients.set(id, { oldNodeId: id, loaderNodeId, executorNodeId: id });

    const inputValues = { ...(node.inputValues ?? {}) };
    const loaderInputValues = Object.fromEntries(
      Object.entries(inputValues).filter(([key]) => CLIENT_OBJECT_LOADER_INPUT_PORTS.has(key))
    );
    const executorInputValues = Object.fromEntries(
      Object.entries(inputValues).filter(([key]) => key === 'in')
    );
    const position = node.position ?? { x: 0, y: 0 };

    nextNodes.push({
      ...node,
      id: loaderNodeId,
      type: 'client-loader',
      position: {
        x: Number(position.x ?? 0) - 180,
        y: Number(position.y ?? 0),
      },
      config: { ...(node.config ?? {}) },
      inputValues: loaderInputValues,
      outputValues: {},
    });
    nextNodes.push({
      ...node,
      id,
      type: 'client-executor',
      config: {},
      inputValues: executorInputValues,
      outputValues: {},
    });
  }

  const migratedConnections: Connection[] = connections.flatMap((connection) => {
    const sourceNodeId = String(connection?.sourceNodeId ?? '');
    const sourcePortId = String(connection?.sourcePortId ?? '');
    const targetNodeId = String(connection?.targetNodeId ?? '');
    const targetPortId = String(connection?.targetPortId ?? '');
    if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];

    const sourceClient = migratedClients.get(sourceNodeId);
    const targetClient = migratedClients.get(targetNodeId);

    const nextConnection: Connection = {
      ...connection,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    };

    if (sourceClient) {
      const mappedOutput = CLIENT_OBJECT_LOADER_OUTPUT_PORTS[sourcePortId];
      if (mappedOutput) {
        nextConnection.sourceNodeId = sourceClient.loaderNodeId;
        nextConnection.sourcePortId = mappedOutput;
      } else if (sourcePortId === 'imageOut') {
        nextConnection.sourceNodeId = sourceClient.executorNodeId;
      }
    }

    if (targetClient) {
      if (CLIENT_OBJECT_LOADER_INPUT_PORTS.has(targetPortId)) {
        nextConnection.targetNodeId = targetClient.loaderNodeId;
      } else if (targetPortId === 'in') {
        nextConnection.targetNodeId = targetClient.executorNodeId;
      }
    }

    return [nextConnection];
  });

  const loaderLinks: Connection[] = Array.from(migratedClients.values()).map((client) => ({
    id: `${client.oldNodeId}:loader-link`,
    sourceNodeId: client.loaderNodeId,
    sourcePortId: 'client',
    targetNodeId: client.executorNodeId,
    targetPortId: 'client',
  }));

  return {
    nodes: nextNodes,
    connections: [...migratedConnections, ...loaderLinks],
    ...(() => {
      const groups = cloneGraphGroups(graph);
      return groups.length > 0 ? { groups } : {};
    })(),
  };
}

const collectMigratedClientsForGraph = (graph: GraphState): Map<string, MigratedClientObject> => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const usedIds = new Set(nodes.map((node) => String(node?.id ?? '')).filter(Boolean));
  const migratedClients = new Map<string, MigratedClientObject>();
  for (const node of nodes) {
    const id = String(node?.id ?? '');
    if (!id || String(node?.type ?? '') !== 'client-object') continue;
    const loaderNodeId = makeUniqueNodeId(`${id}:loader`, usedIds);
    migratedClients.set(id, { oldNodeId: id, loaderNodeId, executorNodeId: id });
  }
  return migratedClients;
};

const migratePortBinding = (
  port: CustomNodePort,
  migratedClients: Map<string, MigratedClientObject>
): CustomNodePort => {
  const bindingNodeId = String(port.binding?.nodeId ?? '');
  const bindingPortId = String(port.binding?.portId ?? '');
  const migratedClient = migratedClients.get(bindingNodeId);
  if (!migratedClient) return { ...port, binding: { ...port.binding } };

  if (port.side === 'input' && CLIENT_OBJECT_LOADER_INPUT_PORTS.has(bindingPortId)) {
    return { ...port, binding: { nodeId: migratedClient.loaderNodeId, portId: bindingPortId } };
  }

  if (port.side === 'input' && bindingPortId === 'in') {
    return { ...port, binding: { nodeId: migratedClient.executorNodeId, portId: 'in' } };
  }

  if (port.side === 'output') {
    const mappedOutput = CLIENT_OBJECT_LOADER_OUTPUT_PORTS[bindingPortId];
    if (mappedOutput) {
      return { ...port, binding: { nodeId: migratedClient.loaderNodeId, portId: mappedOutput } };
    }
    if (bindingPortId === 'imageOut') {
      return { ...port, binding: { nodeId: migratedClient.executorNodeId, portId: 'imageOut' } };
    }
  }

  return { ...port, binding: { ...port.binding } };
};

const inferPinnedProxyPortLabel = (
  proxy: NodeInstance,
  graph: GraphState,
  side: CustomNodePortSide
): string => {
  const proxyId = String(proxy.id ?? '');
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  if (side === 'input') {
    const outgoing = connections.find(
      (connection) =>
        String(connection.sourceNodeId) === proxyId && String(connection.sourcePortId) === 'out'
    );
    if (outgoing) return labelFromPortId(outgoing.targetPortId, 'In');
    return 'In';
  }

  const incoming = connections.find(
    (connection) =>
      String(connection.targetNodeId) === proxyId && String(connection.targetPortId) === 'in'
  );
  if (incoming) return labelFromPortId(incoming.sourcePortId, 'Out');
  return 'Out';
};

const repairPinnedProxyPorts = (
  graph: GraphState,
  ports: CustomNodePort[]
): CustomNodePort[] => {
  const next = ports.map((port) => ({ ...port, binding: { ...port.binding } }));
  const existingProxyIds = new Set(next.map((port) => String(port.binding?.nodeId ?? '')));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

  for (const node of nodes) {
    const id = String(node?.id ?? '');
    if (!id || String(node?.type ?? '') !== 'group-proxy') continue;
    if (existingProxyIds.has(id)) continue;
    if (!Boolean(node.config?.pinned)) continue;

    const direction = String(node.config?.direction ?? 'output');
    const side: CustomNodePortSide = direction === 'input' ? 'input' : 'output';
    const portKey = `p:${id}`;
    if (next.some((port) => String(port.portKey ?? '') === portKey)) continue;

    next.push({
      portKey,
      side,
      label: inferPinnedProxyPortLabel(node, graph, side),
      type: normalizeCustomPortType(node.config?.portType),
      pinned: true,
      y: Number(node.position?.y ?? 0),
      binding: { nodeId: id, portId: side === 'input' ? 'in' : 'out' },
    });
  }

  return next;
};

export function normalizeLegacyCustomNodeDefinition(
  definition: CustomNodeDefinition
): CustomNodeDefinition {
  const migratedClients = collectMigratedClientsForGraph(definition.template);
  const template = normalizeLegacyCustomNodeGraph(definition.template);
  const migratedPorts =
    migratedClients.size === 0
      ? (definition.ports ?? []).map((port) => ({ ...port, binding: { ...port.binding } }))
      : (definition.ports ?? []).map((port) => migratePortBinding(port, migratedClients));

  return {
    ...definition,
    template,
    ports: repairPinnedProxyPorts(template, migratedPorts),
  };
}

export function normalizeLegacyCustomNodePortsForGraph(
  graph: GraphState,
  ports: CustomNodePort[]
): CustomNodePort[] {
  const migratedClients = collectMigratedClientsForGraph(graph);
  if (migratedClients.size === 0) {
    return (ports ?? []).map((port) => ({ ...port, binding: { ...port.binding } }));
  }
  return (ports ?? []).map((port) => migratePortBinding(port, migratedClients));
}
