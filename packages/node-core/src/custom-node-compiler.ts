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

type GraphGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  minimized?: boolean;
  runtimeActive?: boolean;
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
      ? ({
          nodes: internalRaw.nodes,
          connections: internalRaw.connections,
          ...(Array.isArray(internalRaw.groups) ? { groups: internalRaw.groups } : {}),
        } as GraphState)
      : null;

  if (!definitionId || !groupId || !role || !internal) return null;
  return { definitionId, groupId, role, manualGate, internal };
};

const cloneGraphForCompile = (graph: GraphState): GraphState => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const groups = Array.isArray((graph as GraphState & { groups?: GraphGroup[] })?.groups)
    ? ((graph as GraphState & { groups?: GraphGroup[] }).groups ?? []).flatMap((group) => {
        const id = getString(group?.id, '');
        if (!id) return [];
        return [
          {
            id,
            parentId: getString(group?.parentId, '') || null,
            name: getString(group?.name, 'Group'),
            nodeIds: (Array.isArray(group?.nodeIds) ? group.nodeIds : [])
              .map(String)
              .filter(Boolean),
            disabled: Boolean(group?.disabled),
            minimized: Boolean(group?.minimized),
            runtimeActive:
              typeof group?.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
          },
        ];
      })
    : [];
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
    ...(groups.length > 0 ? { groups } : {}),
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

type InputBinding = { nodeId: string; portId: string; value: unknown };

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

const graphWithDefinitionPortBindings = (
  graph: GraphState,
  definition: CustomNodeDefinition
): GraphState => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  const templateNodes = Array.isArray(definition.template?.nodes) ? definition.template.nodes : [];
  const templateConnections = Array.isArray(definition.template?.connections)
    ? definition.template.connections
    : [];
  const nodeIds = new Set(nodes.map((node) => getString(asRecord(node).id, '')).filter(Boolean));
  const requiredIds = new Set(
    (definition.ports ?? [])
      .map((port) => getString(port?.binding?.nodeId, ''))
      .filter((id) => id && !nodeIds.has(id))
  );
  if (requiredIds.size === 0) return graph;

  const nextNodes = [...nodes];
  for (const node of templateNodes) {
    const id = getString(asRecord(node).id, '');
    if (!requiredIds.has(id)) continue;
    nextNodes.push({
      ...(asRecord(node) as NodeInstance),
      config: { ...asRecord(node.config) },
      inputValues: { ...asRecord(node.inputValues) },
      outputValues: {},
    });
    nodeIds.add(id);
  }

  const nextNodeIds = new Set(
    nextNodes.map((node) => getString(asRecord(node).id, '')).filter(Boolean)
  );
  const existingConnectionKeys = new Set(connections.map(connectionKey));
  const nextConnections = [...connections];
  for (const connection of templateConnections) {
    const sourceNodeId = getString(connection?.sourceNodeId, '');
    const sourcePortId = getString(connection?.sourcePortId, '');
    const targetNodeId = getString(connection?.targetNodeId, '');
    const targetPortId = getString(connection?.targetPortId, '');
    if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) continue;
    if (!nextNodeIds.has(sourceNodeId) || !nextNodeIds.has(targetNodeId)) continue;
    const key = connectionKey({ sourceNodeId, sourcePortId, targetNodeId, targetPortId });
    if (existingConnectionKeys.has(key)) continue;
    existingConnectionKeys.add(key);
    nextConnections.push({
      ...(asRecord(connection) as Connection),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    });
  }

  return {
    ...graph,
    nodes: nextNodes,
    connections: nextConnections,
  };
};

const publicInputBindings = (
  node: NodeInstance,
  definition: CustomNodeDefinition,
  internalGraph: GraphState
): InputBinding[] => {
  const inputValues = asRecord(node.inputValues);
  const internalNodesById = new Map(
    (internalGraph.nodes ?? []).map((inner) => [String(inner?.id ?? ''), inner])
  );
  const connections = Array.isArray(internalGraph.connections) ? internalGraph.connections : [];
  const bindings: InputBinding[] = [];

  const appendBinding = (nodeId: string, portId: string, value: unknown) => {
    if (!nodeId || !portId) return;
    bindings.push({ nodeId, portId, value });
  };

  for (const port of definition.ports ?? []) {
    if (String(port.side ?? '') !== 'input') continue;
    const portKey = getString(port.portKey, '');
    if (!portKey || !Object.prototype.hasOwnProperty.call(inputValues, portKey)) continue;
    const bindingNodeId = getString(port.binding?.nodeId, '');
    const bindingPortId = getString(port.binding?.portId, '');
    if (!bindingNodeId || !bindingPortId) continue;
    const value = inputValues[portKey];
    const bindingNode = internalNodesById.get(bindingNodeId) ?? null;

    if (String(bindingNode?.type ?? '') === 'group-proxy' && bindingPortId === 'in') {
      for (const connection of connections) {
        if (String(connection.sourceNodeId ?? '') !== bindingNodeId) continue;
        if (String(connection.sourcePortId ?? '') !== 'out') continue;
        appendBinding(
          getString(connection.targetNodeId, ''),
          getString(connection.targetPortId, ''),
          value
        );
      }
      continue;
    }

    appendBinding(bindingNodeId, bindingPortId, value);
  }

  return bindings;
};

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
    const currentGroups = Array.isArray((current as GraphState & { groups?: GraphGroup[] }).groups)
      ? ((current as GraphState & { groups?: GraphGroup[] }).groups ?? [])
      : [];

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
    const nextGroups: GraphGroup[] = currentGroups.map((group) => ({
      id: String(group.id ?? ''),
      parentId: group.parentId ? String(group.parentId) : null,
      name: String(group.name ?? 'Group'),
      nodeIds: (group.nodeIds ?? []).map(String).filter((id) => !customIds.has(id)),
      disabled: Boolean(group.disabled),
      minimized: Boolean(group.minimized),
      runtimeActive:
        typeof group.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
    })).filter((group) => group.id);

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
      const gateValue = Object.prototype.hasOwnProperty.call(node.inputValues ?? {}, 'gate')
        ? node.inputValues?.gate
        : state.manualGate;
      if (gateValue === false) {
        continue;
      }

      const internalGraph = graphWithDefinitionPortBindings(state.internal as GraphState, def);
      const internalNodes = Array.isArray(internalGraph?.nodes) ? internalGraph.nodes : [];
      const internalConnections = Array.isArray(internalGraph?.connections)
        ? internalGraph.connections
        : [];
      const internalGroups = Array.isArray((internalGraph as GraphState & { groups?: GraphGroup[] }).groups)
        ? ((internalGraph as GraphState & { groups?: GraphGroup[] }).groups ?? [])
        : [];
      const internalGroupIds = new Set(
        internalGroups.map((group) => getString(group?.id, '')).filter(Boolean)
      );
      const fallbackInternalGroupId =
        internalGroups.length === 1 ? getString(internalGroups[0]?.id, '') : '';
      const resolveInternalPortGroupId = (rawGroupId: string): string => {
        const id = String(rawGroupId ?? '');
        if (internalGroupIds.has(id)) return id;
        if (fallbackInternalGroupId && id && id === String(state.groupId ?? '')) {
          return fallbackInternalGroupId;
        }
        return id;
      };
      const inputValuesByInternalNode = new Map<string, Record<string, unknown>>();
      for (const binding of publicInputBindings(node, def, internalGraph)) {
        const patch = inputValuesByInternalNode.get(binding.nodeId) ?? {};
        patch[binding.portId] = binding.value;
        inputValuesByInternalNode.set(binding.nodeId, patch);
      }
      const effectiveInternalGraph: GraphState = {
        ...internalGraph,
        nodes: internalNodes.map((inner) => {
          const innerId = getString(asRecord(inner).id, '');
          const patch = innerId ? inputValuesByInternalNode.get(innerId) : undefined;
          if (!patch) return inner;
          return {
            ...inner,
            inputValues: { ...asRecord(inner.inputValues), ...patch },
          } as NodeInstance;
        }),
        connections: internalConnections,
      };
      const materializedGroupId = (groupId: string): string =>
        `cn:${instanceId}:group:${String(groupId ?? '')}`;

      for (const group of internalGroups) {
        const groupId = getString(group?.id, '');
        if (!groupId) continue;
        const parentId = getString(group?.parentId, '');
        nextGroups.push({
          id: materializedGroupId(groupId),
          parentId: parentId && internalGroupIds.has(parentId) ? materializedGroupId(parentId) : null,
          name: getString(group?.name, 'Group'),
          nodeIds: (Array.isArray(group?.nodeIds) ? group.nodeIds : [])
            .map((nodeId) => materializeInternalNodeId(instanceId, String(nodeId)))
            .filter(Boolean),
          disabled: Boolean(group?.disabled),
          minimized: Boolean(group?.minimized),
        });
      }

      for (const inner of effectiveInternalGraph.nodes ?? []) {
        const record = asRecord(inner);
        const innerId = getString(record.id, '');
        const type = getString(record.type, '');
        if (!innerId || !type) continue;
        const position = asRecord(record.position);
        const inputValuePatch = inputValuesByInternalNode.get(innerId) ?? {};
        const config = { ...asRecord(record.config) };
        const rawGroupId = resolveInternalPortGroupId(getString(config.groupId, ''));
        if ((type === 'group-gate' || type === 'group-proxy') && internalGroupIds.has(rawGroupId)) {
          config.groupId = materializedGroupId(rawGroupId);
        }
        nextNodes.push({
          ...record,
          id: materializeInternalNodeId(instanceId, innerId),
          type,
          position: {
            x: Number(position.x ?? 0),
            y: Number(position.y ?? 0),
          },
          config,
          inputValues: { ...asRecord(record.inputValues), ...inputValuePatch },
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
      ...(nextGroups.length > 0 ? { groups: nextGroups } : {}),
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
  const groups = Array.isArray((graph as GraphState & { groups?: GraphGroup[] })?.groups)
    ? ((graph as GraphState & { groups?: GraphGroup[] }).groups ?? [])
    : [];
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

  return {
    nodes: nextNodes,
    connections: dedupeConnections(rewired),
    ...(groups.length > 0 ? { groups } : {}),
  };
}

export function compileGraphForPatch(
  state: GraphState,
  definitions: CustomNodeDefinition[],
  opts?: CustomNodeCompileOptions
): GraphState {
  const expanded = expandCustomNodesForCompile(state, definitions, opts);
  return stripGroupProxyNodes(expanded, opts);
}
