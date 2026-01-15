/**
 * Purpose: Compile/flatten Custom Nodes for deployable patch export.
 *
 * Phase 2.5 decision: deploy to client must not require the client to "know" Custom Node types.
 * We expand Custom Node instances into their internal subgraphs and then remove editor-only
 * boundary nodes (e.g. `group-proxy`) so the resulting graph contains only standard node types.
 */
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { asRecord, getString } from '$lib/utils/value-guards';
import { readCustomNodeState } from './instance';
import type { CustomNodeDefinition } from './types';

type Connection = GraphState['connections'][number];

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

const connectionKey = (c: {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}) => `${c.sourceNodeId}|${c.sourcePortId}|${c.targetNodeId}|${c.targetPortId}`;

const dedupeConnections = (connections: Connection[]): Connection[] => {
  const seen = new Set<string>();
  const out: Connection[] = [];
  for (const c of connections ?? []) {
    const key = connectionKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
};

const materializeInternalNodeId = (customNodeId: string, internalNodeId: string): string => {
  return `cn:${String(customNodeId ?? '')}:${String(internalNodeId ?? '')}`;
};

const isCustomNodeInstance = (node: NodeInstance): boolean => {
  if (!node) return false;
  const cfg = asRecord(node.config);
  return Boolean(readCustomNodeState(cfg));
};

function definitionById(definitions: CustomNodeDefinition[]): Map<string, CustomNodeDefinition> {
  const map = new Map<string, CustomNodeDefinition>();
  for (const def of definitions ?? []) {
    const id = String(def?.definitionId ?? '');
    if (id) map.set(id, def);
  }
  return map;
}

export function expandCustomNodesForCompile(graph: GraphState, definitions: CustomNodeDefinition[]): GraphState {
  const byId = definitionById(definitions);
  let current = cloneGraphForCompile(graph);

  // Expand iteratively so nested custom nodes (produced by materialization) are expanded too.
  for (let step = 0; step < 64; step += 1) {
    const nodes = Array.isArray(current.nodes) ? current.nodes : [];
    const connections = Array.isArray(current.connections) ? current.connections : [];
    const customNodes = nodes.filter(isCustomNodeInstance);
    if (customNodes.length === 0) return current;

    const customIds = new Set(customNodes.map((n) => String(n.id ?? '')).filter(Boolean));
    const remainingNodes = nodes.filter((n) => !customIds.has(String(n.id ?? '')));

    const incomingByTarget = new Map<string, Connection[]>();
    const outgoingBySource = new Map<string, Connection[]>();
    for (const c of connections) {
      const src = String(c.sourceNodeId ?? '');
      const tgt = String(c.targetNodeId ?? '');
      if (!src || !tgt) continue;
      const inc = incomingByTarget.get(tgt) ?? [];
      inc.push(c);
      incomingByTarget.set(tgt, inc);
      const out = outgoingBySource.get(src) ?? [];
      out.push(c);
      outgoingBySource.set(src, out);
    }

    const nextNodes: GraphState['nodes'] = [...remainingNodes];
    const nextConnections: GraphState['connections'] = connections.filter((c) => {
      const src = String(c.sourceNodeId ?? '');
      const tgt = String(c.targetNodeId ?? '');
      return !(customIds.has(src) || customIds.has(tgt));
    });

    for (const node of customNodes) {
      const instanceId = String(node.id ?? '');
      const state = readCustomNodeState(asRecord(node.config));
      if (!instanceId || !state) continue;
      const def = byId.get(String(state.definitionId ?? '')) ?? null;
      if (!def) {
        throw new Error(
          `[custom-node-flatten] missing definition for ${String(state.definitionId ?? '')}`
        );
      }

      const internalGraph = state.internal as GraphState;
      const internalNodes = Array.isArray(internalGraph?.nodes) ? internalGraph.nodes : [];
      const internalConnections = Array.isArray(internalGraph?.connections) ? internalGraph.connections : [];

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
        });
      }

      for (const c of internalConnections) {
        const record = asRecord(c);
        const src = getString(record.sourceNodeId, '');
        const srcPort = getString(record.sourcePortId, '');
        const tgt = getString(record.targetNodeId, '');
        const tgtPort = getString(record.targetPortId, '');
        if (!src || !srcPort || !tgt || !tgtPort) continue;
        nextConnections.push({
          ...record,
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: materializeInternalNodeId(instanceId, src),
          targetNodeId: materializeInternalNodeId(instanceId, tgt),
          sourcePortId: srcPort,
          targetPortId: tgtPort,
        });
      }

      const portByKey = new Map<string, CustomNodeDefinition['ports'][number]>();
      for (const p of def.ports ?? []) {
        const key = getString(p?.portKey, '');
        if (!key) continue;
        portByKey.set(key, p);
      }

      for (const c of incomingByTarget.get(instanceId) ?? []) {
        const src = String(c.sourceNodeId ?? '');
        const srcPort = String(c.sourcePortId ?? '');
        const tgtPort = String(c.targetPortId ?? '');
        if (!src || !srcPort || !tgtPort) continue;
        if (tgtPort === 'gate') continue; // manager-only gate signal

        const port = portByKey.get(tgtPort) ?? null;
        if (!port || String(port.side) !== 'input') continue;
        const bindingNodeId = getString(port.binding?.nodeId, '');
        const bindingPortId = getString(port.binding?.portId, '');
        if (!bindingNodeId || !bindingPortId) continue;

        nextConnections.push({
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: src,
          sourcePortId: srcPort,
          targetNodeId: materializeInternalNodeId(instanceId, bindingNodeId),
          targetPortId: bindingPortId,
        });
      }

      for (const c of outgoingBySource.get(instanceId) ?? []) {
        const tgt = String(c.targetNodeId ?? '');
        const tgtPort = String(c.targetPortId ?? '');
        const srcPort = String(c.sourcePortId ?? '');
        if (!tgt || !tgtPort || !srcPort) continue;

        const port = portByKey.get(srcPort) ?? null;
        if (!port || String(port.side) !== 'output') continue;
        const bindingNodeId = getString(port.binding?.nodeId, '');
        const bindingPortId = getString(port.binding?.portId, '');
        if (!bindingNodeId || !bindingPortId) continue;

        nextConnections.push({
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
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

  // If we somehow didn't converge, abort instead of returning a partial graph that still contains custom nodes.
  throw new Error('[custom-node-flatten] exceeded max expansion depth (possible cycle or corrupt graph).');
}

export function stripGroupProxyNodes(graph: GraphState): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];

  const proxyIds = new Set(
    nodes
      .filter((n) => String(n.type ?? '') === 'group-proxy')
      .map((n) => String(n.id ?? ''))
      .filter(Boolean)
  );
  if (proxyIds.size === 0) return graph;

  const incomingByTarget = new Map<string, Connection[]>();
  const outgoingBySource = new Map<string, Connection[]>();
  for (const c of connections) {
    const src = String(c.sourceNodeId ?? '');
    const tgt = String(c.targetNodeId ?? '');
    if (!src || !tgt) continue;
    const inc = incomingByTarget.get(tgt) ?? [];
    inc.push(c);
    incomingByTarget.set(tgt, inc);
    const out = outgoingBySource.get(src) ?? [];
    out.push(c);
    outgoingBySource.set(src, out);
  }

  const nextNodes = nodes.filter((n) => !proxyIds.has(String(n.id ?? '')));
  const keptConnections = connections.filter((c) => {
    const src = String(c.sourceNodeId ?? '');
    const tgt = String(c.targetNodeId ?? '');
    return !(proxyIds.has(src) || proxyIds.has(tgt));
  });

  const rewired: Connection[] = [...keptConnections];

  for (const proxyId of proxyIds) {
    const incoming = (incomingByTarget.get(proxyId) ?? []).filter(
      (c) => String(c.targetPortId ?? '') === 'in'
    );
    const outgoing = (outgoingBySource.get(proxyId) ?? []).filter(
      (c) => String(c.sourcePortId ?? '') === 'out'
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

export function compileGraphForPatch(state: GraphState, definitions: CustomNodeDefinition[]): GraphState {
  const expanded = expandCustomNodesForCompile(state, definitions);
  return stripGroupProxyNodes(expanded);
}
