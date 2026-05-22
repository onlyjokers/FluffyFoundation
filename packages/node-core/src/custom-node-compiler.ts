/**
 * Purpose: Compile Custom Node instances into deployable flat graphs.
 *
 * Server, Manager, CLI, and AI all need the same runtime view of collapsed
 * Custom Nodes. The canonical graph may contain `custom:<definitionId>` shell
 * nodes, but runtime executors receive only ordinary node instances.
 */
import type { CustomNodeDefinition } from './semantic-graph-types.js';
import type { Connection, GraphState, NodeInstance } from './types.js';

export type CustomNodeCompileOptions = {
  createConnectionId?: () => string;
};

type CustomNodeInstanceState = {
  definitionId: string;
  groupId: string;
  role: 'mother' | 'child';
  manualGate: boolean;
  internal: GraphState;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const getString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const nextConnectionId = (opts?: CustomNodeCompileOptions): string => {
  if (opts?.createConnectionId) return opts.createConnectionId();
  return `conn-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
};

const readCustomNodeState = (config: Record<string, unknown>): CustomNodeInstanceState | null => {
  const raw = asRecord(config).customNode;
  const record = asRecord(raw);

  const definitionId = getString(record.definitionId, '');
  const groupId = getString(record.groupId, '');
  const roleRaw = getString(record.role, '');
  const role = roleRaw === 'mother' ? 'mother' : roleRaw === 'child' ? 'child' : null;
  const manualGate = typeof record.manualGate === 'boolean' ? record.manualGate : true;
  const internalRaw = asRecord(record.internal);
  const internal =
    Array.isArray(internalRaw.nodes) && Array.isArray(internalRaw.connections)
      ? ({ nodes: internalRaw.nodes, connections: internalRaw.connections } as GraphState)
      : null;

  if (!definitionId || !groupId || !role || !internal) return null;
  return { definitionId, groupId, role, manualGate, internal };
};

const cloneGraphForCompile = (graph: GraphState): GraphState => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  return {
    nodes: nodes.flatMap((node) => {
      const record = asRecord(node);
      const id = getString(record.id, '');
      const type = getString(record.type, '');
      if (!id || !type) return [];
      const position = asRecord(record.position);
      return [
        {
          id,
          type,
          position: {
            x: Number(position.x ?? 0),
            y: Number(position.y ?? 0),
          },
          config: { ...asRecord(record.config) },
          inputValues: { ...asRecord(record.inputValues) },
          outputValues: {},
        },
      ];
    }),
    connections: connections.flatMap((conn) => {
      const record = asRecord(conn);
      const id = getString(record.id, '');
      const sourceNodeId = getString(record.sourceNodeId, '');
      const sourcePortId = getString(record.sourcePortId, '');
      const targetNodeId = getString(record.targetNodeId, '');
      const targetPortId = getString(record.targetPortId, '');
      if (!id || !sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];
      return [
        {
          id,
          sourceNodeId,
          sourcePortId,
          targetNodeId,
          targetPortId,
        },
      ];
    }),
  };
};

const connectionKey = (connection: {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}) =>
  `${connection.sourceNodeId}|${connection.sourcePortId}|${connection.targetNodeId}|${connection.targetPortId}`;

const dedupeConnections = (connections: Connection[]): Connection[] => {
  const seen = new Set<string>();
  const out: Connection[] = [];
  for (const connection of connections ?? []) {
    const key = connectionKey(connection);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(connection);
  }
  return out;
};

const materializeInternalNodeId = (customNodeId: string, internalNodeId: string): string => {
  return `cn:${String(customNodeId ?? '')}:${String(internalNodeId ?? '')}`;
};

const isCustomNodeInstance = (node: NodeInstance): boolean => {
  if (!node) return false;
  return Boolean(readCustomNodeState(asRecord(node.config)));
};

function definitionById(definitions: CustomNodeDefinition[]): Map<string, CustomNodeDefinition> {
  const map = new Map<string, CustomNodeDefinition>();
  for (const def of definitions ?? []) {
    const id = String(def?.definitionId ?? '');
    if (id) map.set(id, def);
  }
  return map;
}

export function expandCustomNodesForCompile(
  graph: GraphState,
  definitions: CustomNodeDefinition[],
  opts?: CustomNodeCompileOptions
): GraphState {
  const byId = definitionById(definitions);
  let current = cloneGraphForCompile(graph);

  for (let step = 0; step < 64; step += 1) {
    const nodes = Array.isArray(current.nodes) ? current.nodes : [];
    const connections = Array.isArray(current.connections) ? current.connections : [];
    const customNodes = nodes.filter(isCustomNodeInstance);
    if (customNodes.length === 0) return current;

    const customIds = new Set(customNodes.map((node) => String(node.id ?? '')).filter(Boolean));
    const remainingNodes = nodes.filter((node) => !customIds.has(String(node.id ?? '')));

    const incomingByTarget = new Map<string, Connection[]>();
    const outgoingBySource = new Map<string, Connection[]>();
    for (const connection of connections) {
      const src = String(connection.sourceNodeId ?? '');
      const tgt = String(connection.targetNodeId ?? '');
      if (!src || !tgt) continue;
      const inc = incomingByTarget.get(tgt) ?? [];
      inc.push(connection);
      incomingByTarget.set(tgt, inc);
      const out = outgoingBySource.get(src) ?? [];
      out.push(connection);
      outgoingBySource.set(src, out);
    }

    const nextNodes: GraphState['nodes'] = [...remainingNodes];
    const nextConnections: GraphState['connections'] = connections.filter((connection) => {
      const src = String(connection.sourceNodeId ?? '');
      const tgt = String(connection.targetNodeId ?? '');
      return !(customIds.has(src) || customIds.has(tgt));
    });

    for (const node of customNodes) {
      const instanceId = String(node.id ?? '');
      const state = readCustomNodeState(asRecord(node.config));
      if (!instanceId || !state) continue;
      const def = byId.get(String(state.definitionId ?? '')) ?? null;
      if (!def) {
        throw new Error(
          `[custom-node-compiler] missing definition for ${String(state.definitionId ?? '')}`
        );
      }
      if (!state.manualGate || node.inputValues?.gate === false) {
        continue;
      }

      const internalGraph = state.internal as GraphState;
      const internalNodes = Array.isArray(internalGraph?.nodes) ? internalGraph.nodes : [];
      const internalConnections = Array.isArray(internalGraph?.connections)
        ? internalGraph.connections
        : [];

      for (const inner of internalNodes) {
        const record = asRecord(inner);
        const innerId = getString(record.id, '');
        const type = getString(record.type, '');
        if (!innerId || !type) continue;
        const position = asRecord(record.position);
        nextNodes.push({
          ...record,
          id: materializeInternalNodeId(instanceId, innerId),
          type,
          position: {
            x: Number(position.x ?? 0),
            y: Number(position.y ?? 0),
          },
          config: { ...asRecord(record.config) },
          inputValues: { ...asRecord(record.inputValues) },
          outputValues: {},
        } as NodeInstance);
      }

      for (const connection of internalConnections) {
        const record = asRecord(connection);
        const src = getString(record.sourceNodeId, '');
        const srcPort = getString(record.sourcePortId, '');
        const tgt = getString(record.targetNodeId, '');
        const tgtPort = getString(record.targetPortId, '');
        if (!src || !srcPort || !tgt || !tgtPort) continue;
        nextConnections.push({
          ...record,
          id: nextConnectionId(opts),
          sourceNodeId: materializeInternalNodeId(instanceId, src),
          targetNodeId: materializeInternalNodeId(instanceId, tgt),
          sourcePortId: srcPort,
          targetPortId: tgtPort,
        } as Connection);
      }

      const portByKey = new Map<string, CustomNodeDefinition['ports'][number]>();
      for (const port of def.ports ?? []) {
        const key = getString(port?.portKey, '');
        if (!key) continue;
        portByKey.set(key, port);
      }

      for (const connection of incomingByTarget.get(instanceId) ?? []) {
        const src = String(connection.sourceNodeId ?? '');
        const srcPort = String(connection.sourcePortId ?? '');
        const tgtPort = String(connection.targetPortId ?? '');
        if (!src || !srcPort || !tgtPort) continue;
        if (tgtPort === 'gate') continue;

        const port = portByKey.get(tgtPort) ?? null;
        if (!port || String(port.side) !== 'input') continue;
        const bindingNodeId = getString(port.binding?.nodeId, '');
        const bindingPortId = getString(port.binding?.portId, '');
        if (!bindingNodeId || !bindingPortId) continue;

        nextConnections.push({
          id: nextConnectionId(opts),
          sourceNodeId: src,
          sourcePortId: srcPort,
          targetNodeId: materializeInternalNodeId(instanceId, bindingNodeId),
          targetPortId: bindingPortId,
        });
      }

      for (const connection of outgoingBySource.get(instanceId) ?? []) {
        const tgt = String(connection.targetNodeId ?? '');
        const tgtPort = String(connection.targetPortId ?? '');
        const srcPort = String(connection.sourcePortId ?? '');
        if (!tgt || !tgtPort || !srcPort) continue;

        const port = portByKey.get(srcPort) ?? null;
        if (!port || String(port.side) !== 'output') continue;
        const bindingNodeId = getString(port.binding?.nodeId, '');
        const bindingPortId = getString(port.binding?.portId, '');
        if (!bindingNodeId || !bindingPortId) continue;

        nextConnections.push({
          id: nextConnectionId(opts),
          sourceNodeId: materializeInternalNodeId(instanceId, bindingNodeId),
          sourcePortId: bindingPortId,
          targetNodeId: tgt,
          targetPortId: tgtPort,
        });
      }
    }

    current = {
      nodes: nextNodes,
      connections: dedupeConnections(nextConnections),
    };
  }

  throw new Error('[custom-node-compiler] exceeded max expansion depth (possible cycle or corrupt graph).');
}

export function stripGroupProxyNodes(
  graph: GraphState,
  opts?: CustomNodeCompileOptions
): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];

  const proxyIds = new Set(
    nodes
      .filter((node) => String(node.type ?? '') === 'group-proxy')
      .map((node) => String(node.id ?? ''))
      .filter(Boolean)
  );
  if (proxyIds.size === 0) return graph;

  const incomingByTarget = new Map<string, Connection[]>();
  const outgoingBySource = new Map<string, Connection[]>();
  for (const connection of connections) {
    const src = String(connection.sourceNodeId ?? '');
    const tgt = String(connection.targetNodeId ?? '');
    if (!src || !tgt) continue;
    const inc = incomingByTarget.get(tgt) ?? [];
    inc.push(connection);
    incomingByTarget.set(tgt, inc);
    const out = outgoingBySource.get(src) ?? [];
    out.push(connection);
    outgoingBySource.set(src, out);
  }

  const nextNodes = nodes.filter((node) => !proxyIds.has(String(node.id ?? '')));
  const keptConnections = connections.filter((connection) => {
    const src = String(connection.sourceNodeId ?? '');
    const tgt = String(connection.targetNodeId ?? '');
    return !(proxyIds.has(src) || proxyIds.has(tgt));
  });

  const rewired: Connection[] = [...keptConnections];

  for (const proxyId of proxyIds) {
    const incoming = (incomingByTarget.get(proxyId) ?? []).filter(
      (connection) => String(connection.targetPortId ?? '') === 'in'
    );
    const outgoing = (outgoingBySource.get(proxyId) ?? []).filter(
      (connection) => String(connection.sourcePortId ?? '') === 'out'
    );

    for (const inc of incoming) {
      const srcNodeId = String(inc.sourceNodeId ?? '');
      const srcPortId = String(inc.sourcePortId ?? '');
      if (!srcNodeId || !srcPortId) continue;
      for (const out of outgoing) {
        const tgtNodeId = String(out.targetNodeId ?? '');
        const tgtPortId = String(out.targetPortId ?? '');
        if (!tgtNodeId || !tgtPortId) continue;
        rewired.push({
          id: `bypass:${proxyId}:${String(inc.id ?? '')}->${String(out.id ?? '')}`,
          sourceNodeId: srcNodeId,
          sourcePortId: srcPortId,
          targetNodeId: tgtNodeId,
          targetPortId: tgtPortId,
        });
      }
    }
  }

  return { nodes: nextNodes, connections: dedupeConnections(rewired) };
}

export function compileGraphForPatch(
  state: GraphState,
  definitions: CustomNodeDefinition[],
  opts?: CustomNodeCompileOptions
): GraphState {
  const expanded = expandCustomNodesForCompile(state, definitions, opts);
  return stripGroupProxyNodes(expanded, opts);
}
