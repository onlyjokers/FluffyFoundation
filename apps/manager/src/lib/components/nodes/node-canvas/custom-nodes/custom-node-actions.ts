// Purpose: Custom Node conversion actions (uncouple, nodalize, denodalize).
import { get, type Readable } from 'svelte/store';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition, CustomNodePort } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import type { NodeRegistry } from '@shugu/node-core';
import { asRecord, getNumber, getString } from '../../../../utils/value-guards';
import type { GroupFrame, NodeGroup } from '../controllers/group-controller';
import { cloneGraphState } from './custom-node-graph';

export type CustomNodeActions = {
  handleUncoupleCustomNode: (nodeId: string) => void;
  handleDenodalizeGroup: (groupId: string) => void;
  handleNodalizeGroup: (groupId: string) => void;
};

type GroupController = {
  nodeGroups: Readable<NodeGroup[]>;
  setGroups: (groups: NodeGroup[]) => void;
  disassembleGroup: (groupId: string) => void;
  scheduleHighlight: () => void;
};

type GroupPortNodesController = {
  ensureGroupPortNodes: () => void;
  disassembleGroupAndPorts: (groupId: string) => void;
  scheduleNormalizeProxies: () => void;
};

type ViewAdapter = {
  getNodePosition: (nodeId: string) => { x: number; y: number } | null;
};

type ExternalConnection =
  | {
      sourceNodeId: string;
      sourcePortId: string;
      targetPortId: string;
      kind: 'input';
    }
  | {
      targetNodeId: string;
      targetPortId: string;
      sourcePortId: string;
      kind: 'output';
    };

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
  exportGraph: () => GraphState;
  updateNodeType: (nodeId: string, type: string) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void;
  updateNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  addNode: (node: NodeInstance) => void;
  removeNode: (nodeId: string) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (connId: string) => void;
};

type CustomNodeActionsOptions = {
  nodeEngine: NodeEngine;
  nodeRegistry: NodeRegistry;
  groupController: GroupController;
  groupPortNodesController: GroupPortNodesController;
  groupFrames: Readable<GroupFrame[]>;
  viewAdapter: ViewAdapter;
  buildGroupPortIndex: (
    state: GraphState
  ) => Map<string, { gateId?: string; proxyIds?: string[]; legacyActivateIds?: string[] }>;
  groupIdFromNode: (node: NodeInstance) => string | null;
  customNodeType: (definitionId: string) => string;
  addCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  removeCustomNodeDefinition: (definitionId: string) => void;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: CustomNodeInstanceState
  ) => Record<string, unknown>;
  expandedCustomByGroupId: Map<string, { groupId: string; nodeId: string }>;
  forcedHiddenNodeIds: Set<string>;
  refreshExpandedCustomGroupIds: () => void;
  requestFramesUpdate: () => void;
  setSelectedNode: (nodeId: string) => void;
};

const generateId = () => `node-${crypto.randomUUID?.() ?? Date.now()}`;

export const createCustomNodeActions = (opts: CustomNodeActionsOptions): CustomNodeActions => {
  const handleUncoupleCustomNode = (nodeId: string) => {
    const id = String(nodeId ?? '');
    if (!id) return;

    const node = opts.nodeEngine.getNode(id);
    if (!node) return;

    const state = opts.readCustomNodeState(node.config ?? {});
    if (!state || state.role !== 'child') return;

    const baseDef = opts.getCustomNodeDefinition(state.definitionId);
    if (!baseDef) return;

    const ok = confirm(
      `Uncouple "${String(baseDef.name ?? 'Custom Node')}"?\n\nThis will fork a new Custom Node definition and turn this instance into the mother.`
    );
    if (!ok) return;

    const definitionId = crypto.randomUUID?.() ?? `${Date.now()}`;
    const name = `${String(baseDef.name ?? 'Custom Node')} (Uncoupled)`;

    const template = cloneGraphState(state.internal);

    const ports = baseDef.ports.map((p) => ({
      ...p,
      binding: { ...p.binding },
    }));

    opts.addCustomNodeDefinition({
      definitionId,
      name,
      template,
      ports,
    });

    opts.nodeEngine.updateNodeType(id, opts.customNodeType(definitionId));
    opts.nodeEngine.updateNodeConfig(
      id,
      opts.writeCustomNodeState(node.config ?? {}, {
        ...state,
        definitionId,
        role: 'mother',
      })
    );
    opts.nodeEngine.updateNodeInputValue(id, 'gate', state.manualGate);
  };

  const handleDenodalizeGroup = (groupId: string) => {
    const id = String(groupId ?? '');
    if (!id) return;

    const expanded = opts.expandedCustomByGroupId.get(id) ?? null;
    if (!expanded) return;

    const motherNodeId = String(expanded.nodeId ?? '');
    if (!motherNodeId) return;

    const motherNode = opts.nodeEngine.getNode(motherNodeId);
    if (!motherNode) return;

    const state = opts.readCustomNodeState(motherNode.config ?? {});
    if (!state || state.role !== 'mother') return;

    const def = opts.getCustomNodeDefinition(state.definitionId);
    const name = String(def?.name ?? 'Custom Node');

    const graph = opts.nodeEngine.exportGraph();
    const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const nodes: NodeInstance[] = rawNodes.flatMap((entry) => {
      const record = asRecord(entry);
      const id = getString(record.id, '');
      if (!id) return [];
      const type = getString(record.type, '');
      const position = asRecord(record.position);
      return [
        {
          id,
          type,
          position: {
            x: getNumber(position.x, 0),
            y: getNumber(position.y, 0),
          },
          config: { ...asRecord(record.config) },
          inputValues: { ...asRecord(record.inputValues) },
          outputValues: { ...asRecord(record.outputValues) },
        },
      ];
    });
    const rawConnections = Array.isArray(graph.connections) ? graph.connections : [];
    const connections: Connection[] = rawConnections.flatMap((entry) => {
      const record = asRecord(entry);
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
    });

    const ok = confirm(
      `Denodalize "${name}"?\n\nThis will remove the Custom Node (all instances) and restore a normal Group frame. Internal nodes will remain as regular nodes.`
    );
    if (!ok) return;

    const instanceNodes = nodes
      .map((n) => ({ id: n.id, state: opts.readCustomNodeState(n.config ?? {}) }))
      .filter(
        (entry): entry is { id: string; state: CustomNodeInstanceState } =>
          Boolean(entry.id && entry.state && entry.state.definitionId === state.definitionId)
      );
    const instanceIds = instanceNodes.map((entry) => entry.id);
    const motherInstances = instanceNodes.filter((entry) => entry.state.role === 'mother');

    for (const inst of motherInstances) {
      const gid = String(inst.state?.groupId ?? '');
      if (!gid || gid === id) continue;
      if (opts.expandedCustomByGroupId.has(gid)) {
        opts.expandedCustomByGroupId.delete(gid);
        opts.forcedHiddenNodeIds.delete(String(inst.id ?? ''));
      }
      opts.groupPortNodesController.disassembleGroupAndPorts(gid);

      const prefixOther = `cn:${String(inst.id ?? '')}:`;
      for (const n of nodes) {
        const nid = n.id;
        if (nid.startsWith(prefixOther)) opts.nodeEngine.removeNode(nid);
      }
    }

    const prefix = `cn:${motherNodeId}:`;
    const materialized = nodes.filter((n) => n.id.startsWith(prefix));

    const idMap = new Map<string, string>();
    for (const node of materialized) {
      const oldId = node.id;
      const newId = generateId();
      idMap.set(oldId, newId);
      const nextNode: NodeInstance = {
        ...node,
        id: newId,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      };
      opts.nodeEngine.addNode(nextNode);
    }

    for (const c of connections) {
      const connId = c.id;
      if (!connId) continue;
      const src = c.sourceNodeId;
      const tgt = c.targetNodeId;
      const nextSrc = idMap.get(src) ?? src;
      const nextTgt = idMap.get(tgt) ?? tgt;
      if (nextSrc === src && nextTgt === tgt) continue;
      opts.nodeEngine.removeConnection(connId);
      const nextConn: Connection = {
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: nextSrc,
        sourcePortId: c.sourcePortId,
        targetNodeId: nextTgt,
        targetPortId: c.targetPortId,
      };
      opts.nodeEngine.addConnection(nextConn);
    }

    const groups = get(opts.groupController.nodeGroups) ?? [];
    const nextGroups = groups.map((group) => {
      if (group.id !== id) return group;
      const nextNodeIds = group.nodeIds.map((nodeId) => idMap.get(nodeId) ?? nodeId);
      return { ...group, nodeIds: nextNodeIds };
    });
    opts.groupController.setGroups(nextGroups);

    for (const oldId of idMap.keys()) {
      opts.nodeEngine.removeNode(oldId);
    }

    for (const instId of instanceIds) {
      opts.nodeEngine.removeNode(instId);
    }

    opts.removeCustomNodeDefinition(state.definitionId);

    opts.expandedCustomByGroupId.delete(id);
    opts.forcedHiddenNodeIds.delete(motherNodeId);
    opts.refreshExpandedCustomGroupIds();

    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
    opts.groupPortNodesController.scheduleNormalizeProxies();
  };

  const handleNodalizeGroup = (groupId: string) => {
    const rootId = String(groupId ?? '');
    if (!rootId) return;

    const groupsSnapshot = get(opts.groupController.nodeGroups);
    const group = groupsSnapshot.find((g) => String(g.id) === rootId) ?? null;
    if (!group) return;

    const ok = confirm(
      `Nodalize "${String(group.name ?? 'Group')}"?\n\nThis will replace the Group with a real Custom Node (mother instance).`
    );
    if (!ok) return;

    // Ensure the latest group port nodes exist before snapshotting proxies.
    opts.groupPortNodesController.ensureGroupPortNodes();

    const state = opts.nodeEngine.exportGraph();
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const connections = Array.isArray(state.connections) ? state.connections : [];

    // Collect subtree group ids so we can remove all group metadata + port nodes.
    const subtreeGroupIds = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const current = String(stack.pop() ?? '');
      if (!current || subtreeGroupIds.has(current)) continue;
      subtreeGroupIds.add(current);
      for (const g of groupsSnapshot) {
        if (String(g.parentId ?? '') !== current) continue;
        stack.push(String(g.id));
      }
    }

    const portIndex = opts.buildGroupPortIndex(state);

    const toRemove = new Set<string>();
    const groupById = new Map(groupsSnapshot.map((g) => [String(g.id), g] as const));
    for (const gid of subtreeGroupIds) {
      const g = groupById.get(String(gid));
      if (!g) continue;
      for (const nodeId of g.nodeIds ?? []) toRemove.add(String(nodeId));
    }

    // Also remove group port nodes (gate/proxy/legacy activate) for the whole subtree.
    for (const gid of subtreeGroupIds) {
      const entry = portIndex.get(String(gid));
      if (!entry) continue;
      if (entry.gateId) toRemove.add(String(entry.gateId));
      for (const id of entry.proxyIds ?? []) toRemove.add(String(id));
      for (const id of entry.legacyActivateIds ?? []) toRemove.add(String(id));
    }

    // Remove group-frame nodes (minimized UI) for the subtree.
    for (const node of nodes) {
      if (String(node.type) !== 'group-frame') continue;
      const gid = opts.groupIdFromNode(node);
      if (!gid || !subtreeGroupIds.has(String(gid))) continue;
      toRemove.add(String(node.id));
    }

    // Template includes all nodes we remove except group frames + group gate/activate nodes (editor affordances).
    const excludedTypes = new Set(['group-frame', 'group-gate', 'group-activate']);
    const templateNodeIds = new Set<string>();
    for (const nodeId of Array.from(toRemove)) {
      const node = nodes.find((n) => String(n.id) === String(nodeId));
      if (!node) continue;
      if (excludedTypes.has(String(node.type))) continue;
      templateNodeIds.add(String(nodeId));
    }

    const frame = (get(opts.groupFrames) ?? []).find((f) => f.group.id === rootId) ?? null;
    const originX = frame ? Number(frame.left ?? 0) : 0;
    const originY = frame ? Number(frame.top ?? 0) : 0;

    const nodeById = new Map(nodes.map((n) => [String(n.id), n] as const));

    const positionFor = (nodeId: string) => {
      const viewPos = opts.viewAdapter.getNodePosition(String(nodeId));
      if (viewPos && Number.isFinite(viewPos.x) && Number.isFinite(viewPos.y)) return viewPos;
      const instance = nodeById.get(String(nodeId));
      return instance?.position ?? { x: originX, y: originY };
    };

    const templateNodes: NodeInstance[] = Array.from(templateNodeIds).flatMap((id) => {
      const node = nodeById.get(String(id));
      if (!node) return [];
      const pos = positionFor(String(id));
      return [
        {
          ...node,
          position: { x: Number(pos.x) - originX, y: Number(pos.y) - originY },
          outputValues: {},
        },
      ];
    });

    const templateConnections: Connection[] = connections.filter(
      (conn) =>
        templateNodeIds.has(String(conn.sourceNodeId)) &&
        templateNodeIds.has(String(conn.targetNodeId)) &&
        Boolean(String(conn.sourcePortId ?? '')) &&
        Boolean(String(conn.targetPortId ?? ''))
    );

    const resolvePortLabel = (nodeType: string, side: 'input' | 'output', portId: string): string => {
      const def = opts.nodeRegistry.get(String(nodeType ?? ''));
      const ports = side === 'input' ? def?.inputs : def?.outputs;
      const port = (ports ?? []).find((p) => String(p.id) === String(portId)) ?? null;
      return String(port?.label ?? portId);
    };

    // Build Custom Node ports from the root group's boundary proxy nodes.
    const rootEntry = portIndex.get(rootId) ?? { legacyActivateIds: [], proxyIds: [] };
    const portKeyByProxyId = new Map<string, string>();

    const ports: CustomNodePort[] = (rootEntry.proxyIds ?? []).flatMap((proxyId) => {
      const id = String(proxyId ?? '');
      if (!id) return [];
      const node = nodeById.get(id);
      if (!node || String(node.type) !== 'group-proxy') return [];

      const directionRaw =
        typeof node.config?.direction === 'string' ? node.config.direction : 'output';
      const side: 'input' | 'output' = directionRaw === 'input' ? 'input' : 'output';
      const bindingPortId = side === 'input' ? 'in' : 'out';
      const portKey = `p:${id}`;
      portKeyByProxyId.set(id, portKey);

      const portTypeRaw =
        typeof node.config?.portType === 'string' ? node.config.portType : 'any';
      const type = portTypeRaw ? portTypeRaw : 'any';
      const pinned = Boolean(node.config?.pinned);

      const pos = positionFor(id);
      const y = Number(pos.y) - originY;

      const label = (() => {
        if (side === 'input') {
          const inner = connections.find(
            (conn) => conn.sourceNodeId === id && conn.sourcePortId === 'out'
          );
          if (!inner) return 'In';
          const targetNode = nodeById.get(String(inner.targetNodeId));
          if (!targetNode) return String(inner.targetPortId ?? 'In');
          return resolvePortLabel(String(targetNode.type), 'input', String(inner.targetPortId));
        }
        const inner = connections.find(
          (conn) => conn.targetNodeId === id && conn.targetPortId === 'in'
        );
        if (!inner) return 'Out';
        const sourceNode = nodeById.get(String(inner.sourceNodeId));
        if (!sourceNode) return String(inner.sourcePortId ?? 'Out');
        return resolvePortLabel(String(sourceNode.type), 'output', String(inner.sourcePortId));
      })();

      return [
        {
          portKey,
          side,
          label,
          type,
          pinned,
          y: Number.isFinite(y) ? y : 0,
          binding: { nodeId: id, portId: bindingPortId },
        },
      ];
    });

    // Capture external wiring so we can reconnect it to the new Custom Node ports.
    const externalConnections: ExternalConnection[] = [];

    const isRemoved = (nodeId: string) => toRemove.has(String(nodeId));

    for (const proxyId of rootEntry.proxyIds ?? []) {
      const id = String(proxyId ?? '');
      if (!id) continue;
      const node = nodeById.get(id);
      if (!node || String(node.type) !== 'group-proxy') continue;

      const portKey = portKeyByProxyId.get(id);
      if (!portKey) continue;

      const directionRaw = String(node?.config?.direction ?? 'output');
      if (directionRaw === 'input') {
        const incoming = connections.find(
          (conn) =>
            String(conn.targetNodeId) === id &&
            String(conn.targetPortId) === 'in' &&
            !isRemoved(String(conn.sourceNodeId))
        );
        if (incoming) {
          externalConnections.push({
            sourceNodeId: String(incoming.sourceNodeId),
            sourcePortId: String(incoming.sourcePortId),
            targetPortId: portKey,
            kind: 'input',
          });
        }
      } else {
        for (const c of connections) {
          if (String(c.sourceNodeId) !== id) continue;
          if (String(c.sourcePortId) !== 'out') continue;
          if (isRemoved(String(c.targetNodeId))) continue;
          externalConnections.push({
            targetNodeId: String(c.targetNodeId),
            targetPortId: String(c.targetPortId),
            sourcePortId: portKey,
            kind: 'output',
          });
        }
      }
    }

    const gateConn = (() => {
      const gateId = rootEntry.gateId ? String(rootEntry.gateId) : '';
      if (!gateId) return null;
      const c = connections.find(
        (conn) =>
          String(conn.targetNodeId) === gateId &&
          String(conn.targetPortId) === 'active' &&
          !isRemoved(String(conn.sourceNodeId))
      );
      return c
        ? { sourceNodeId: String(c.sourceNodeId), sourcePortId: String(c.sourcePortId) }
        : null;
    })();

    const definitionId = crypto.randomUUID?.() ?? `${Date.now()}`;
    opts.addCustomNodeDefinition({
      definitionId,
      name: String(group.name ?? 'Group'),
      template: { nodes: templateNodes, connections: templateConnections },
      ports,
    });

    // Remove group metadata first so the frame disappears immediately.
    opts.groupController.disassembleGroup(rootId);

    // Remove all nodes in the group subtree (including boundary proxies).
    for (const id of Array.from(toRemove)) {
      if (!id) continue;
      opts.nodeEngine.removeNode(String(id));
    }

    const motherNodeId = generateId();
    const motherType = opts.customNodeType(definitionId);
    const motherPos = frame ? { x: originX, y: originY } : { x: originX, y: originY };

    const motherInternal = cloneGraphState({ nodes: templateNodes, connections: templateConnections });

    const initialGate = !group.disabled;
    const motherConfig = opts.writeCustomNodeState({}, {
      definitionId,
      groupId: rootId,
      role: 'mother',
      manualGate: initialGate,
      internal: motherInternal,
    });

    const motherNode: NodeInstance = {
      id: motherNodeId,
      type: motherType,
      position: motherPos,
      config: motherConfig,
      inputValues: { gate: initialGate },
      outputValues: {},
    };
    opts.nodeEngine.addNode(motherNode);

    // Reconnect gate input (wiredGateInput) if present.
    if (gateConn) {
      opts.nodeEngine.addConnection({
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: gateConn.sourceNodeId,
        sourcePortId: gateConn.sourcePortId,
        targetNodeId: motherNodeId,
        targetPortId: 'gate',
      });
    }

    // Reconnect proxy ports.
    for (const entry of externalConnections) {
      if (entry.kind === 'input') {
        opts.nodeEngine.addConnection({
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: entry.sourceNodeId,
          sourcePortId: entry.sourcePortId,
          targetNodeId: motherNodeId,
          targetPortId: entry.targetPortId,
        });
      } else {
        opts.nodeEngine.addConnection({
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: motherNodeId,
          sourcePortId: entry.sourcePortId,
          targetNodeId: entry.targetNodeId,
          targetPortId: entry.targetPortId,
        });
      }
    }

    opts.setSelectedNode(motherNodeId);
  };

  return { handleUncoupleCustomNode, handleDenodalizeGroup, handleNodalizeGroup };
};
