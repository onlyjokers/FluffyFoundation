// Purpose: Custom node expansion/collapse logic for Group Frames.
import { get, type Readable } from 'svelte/store';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import type { NodeRegistry } from '@shugu/node-core';
import { asRecord, getBoolean, getNumber, getString } from '../../../../utils/value-guards';
import type { GroupFrame, NodeGroup } from '../controllers/group-controller';

export type ExpandedCustomNodeFrame = {
  groupId: string;
  nodeId: string;
};

type GroupController = {
  nodeGroups: Readable<NodeGroup[]>;
  setGroups: (groups: NodeGroup[]) => void;
  scheduleHighlight: () => void;
};

type GroupPortNodesController = {
  ensureGroupPortNodes: () => void;
  scheduleAlign: () => void;
  scheduleNormalizeProxies: () => void;
};

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
  addNode: (node: NodeInstance) => void;
  removeNode: (nodeId: string) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (connId: string) => void;
  updateNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void;
  exportGraph: () => GraphState;
  lastError?: { set?: (msg: string) => void };
};

type CustomNodeExpansionOptions = {
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  onExpandedGroupIdsChange?: (next: Set<string>) => void;
  forcedHiddenNodeIds: Set<string>;
  nodeEngine: NodeEngine;
  groupController: GroupController;
  groupPortNodesController: GroupPortNodesController;
  groupFrames: Readable<GroupFrame[]>;
  nodeRegistry: NodeRegistry;
  requestFramesUpdate: () => void;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: CustomNodeInstanceState
  ) => Record<string, unknown>;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | null;
  upsertCustomNodeDefinition: (def: CustomNodeDefinition) => void;
  customNodeDefinitions: Readable<CustomNodeDefinition[]>;
  definitionsInCycles: (defs: CustomNodeDefinition[]) => Set<string>;
  buildGroupPortIndex: (state: GraphState) => Map<string, { gateId?: string }>;
  groupIdFromNode: (node: NodeInstance) => string | null;
  isGroupPortNodeType: (type: string) => boolean;
  deepestGroupIdContainingNode: (nodeId: string, groups: NodeGroup[]) => string | null;
  syncCoupledCustomNodesForDefinition: (definitionId: string) => void;
  materializeInternalNodeId: (customNodeId: string, internalNodeId: string) => string;
  isMaterializedInternalNodeId: (customNodeId: string, nodeId: string) => boolean;
  internalNodeIdFromMaterialized: (customNodeId: string, nodeId: string) => string;
  customNodeIdFromMaterializedNodeId: (nodeId: string) => string | null;
};

export const createCustomNodeExpansion = (opts: CustomNodeExpansionOptions) => {
  let expandedCustomGroupIds = new Set<string>();

  const refreshExpandedCustomGroupIds = () => {
    expandedCustomGroupIds = new Set(Array.from(opts.expandedCustomByGroupId.keys()));
    opts.onExpandedGroupIdsChange?.(new Set(expandedCustomGroupIds));
    return expandedCustomGroupIds;
  };

  const rehydrateExpandedCustomFrames = (state: GraphState) => {
    const nodes = Array.isArray(state?.nodes) ? state.nodes : [];
    const customNodeIds = new Set<string>();
    for (const n of nodes) {
      const id = n.id;
      const customId = opts.customNodeIdFromMaterializedNodeId(id);
      if (customId) customNodeIds.add(customId);
    }
    if (customNodeIds.size === 0) return;

    const groups = get(opts.groupController.nodeGroups) ?? [];
    let nextGroups = groups;
    let groupsChanged = false;
    let expandedChanged = false;

    const decorationTypes = new Set(['group-activate', 'group-gate', 'group-proxy', 'group-frame']);

    for (const customId of customNodeIds) {
      const node = opts.nodeEngine.getNode(String(customId));
      if (!node) continue;
      const state = opts.readCustomNodeState(node.config ?? {});
      if (!state || state.role !== 'mother') continue;

      const groupId = String(state.groupId ?? '');
      if (!groupId) continue;

      // Mark as expanded so the Group frame shows the Custom Node actions (Collapse only).
      if (!opts.expandedCustomByGroupId.has(groupId)) {
        opts.expandedCustomByGroupId.set(groupId, { groupId, nodeId: String(customId) });
        opts.forcedHiddenNodeIds.add(String(customId));
        expandedChanged = true;
      }

      if (!nextGroups.some((g) => g.id === groupId)) {
        const def = opts.getCustomNodeDefinition(state.definitionId);
        const parentId = opts.deepestGroupIdContainingNode(String(customId), nextGroups);
        const nodeIdsInGroup = nodes
          .filter(
            (n) =>
              opts.isMaterializedInternalNodeId(String(customId), String(n.id ?? '')) &&
              !decorationTypes.has(String(n.type ?? ''))
          )
          .map((n) => String(n.id));

        nextGroups = [
          ...nextGroups,
          {
            id: groupId,
            parentId: parentId ? String(parentId) : null,
            name: String(def?.name ?? 'Custom Node'),
            nodeIds: nodeIdsInGroup,
            disabled: !state.manualGate,
            minimized: false,
          },
        ];
        groupsChanged = true;
      }
    }

    if (!groupsChanged && !expandedChanged) return;

    if (groupsChanged) {
      opts.groupController.setGroups(nextGroups);
    }

    refreshExpandedCustomGroupIds();
    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
  };

  const handleExpandCustomNode = (nodeId: string) => {
    const id = String(nodeId ?? '');
    if (!id) return;

    const node = opts.nodeEngine.getNode(id);
    if (!node) return;

    const state = opts.readCustomNodeState(node.config ?? {});
    if (!state || state.role !== 'mother') return;

    const groupId = String(state.groupId ?? '');
    if (!groupId) return;
    if (opts.expandedCustomByGroupId.has(groupId)) return;

    const def = opts.getCustomNodeDefinition(state.definitionId);
    if (!def) return;

    const baseX = Number(node.position?.x ?? 0);
    const baseY = Number(node.position?.y ?? 0);

    const internal = state.internal ?? { nodes: [], connections: [] };
    const internalNodes = Array.isArray(internal?.nodes) ? internal.nodes : [];
    const internalConnections = Array.isArray(internal?.connections) ? internal.connections : [];

    const decorationTypes = new Set(['group-activate', 'group-gate', 'group-proxy', 'group-frame']);
    const materializedIdsInGroup: string[] = [];

    for (const entry of internalNodes) {
      const nodeRecord = asRecord(entry);
      const internalId = getString(nodeRecord.id, '');
      if (!internalId) continue;
      const matId = opts.materializeInternalNodeId(id, internalId);
      const pos = asRecord(nodeRecord.position);
      const x = baseX + getNumber(pos.x, 0);
      const y = baseY + getNumber(pos.y, 0);
      const type = getString(nodeRecord.type, '');
      const config = asRecord(nodeRecord.config);
      const inputValues = asRecord(nodeRecord.inputValues);

      const nextNode: NodeInstance = {
        id: matId,
        type,
        position: { x, y },
        config: { ...config },
        inputValues: { ...inputValues },
        outputValues: {},
      };

      opts.nodeEngine.addNode(nextNode);

      if (!decorationTypes.has(type)) materializedIdsInGroup.push(matId);
    }

    for (const entry of internalConnections) {
      const connRecord = asRecord(entry);
      const sourceNodeId = getString(connRecord.sourceNodeId, '');
      const sourcePortId = getString(connRecord.sourcePortId, '');
      const targetNodeId = getString(connRecord.targetNodeId, '');
      const targetPortId = getString(connRecord.targetPortId, '');
      if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) continue;

      const nextConn: Connection = {
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: opts.materializeInternalNodeId(id, sourceNodeId),
        sourcePortId,
        targetNodeId: opts.materializeInternalNodeId(id, targetNodeId),
        targetPortId,
      };
      opts.nodeEngine.addConnection(nextConn);
    }

    const prevGroups = get(opts.groupController.nodeGroups) ?? [];
    const parentId = opts.deepestGroupIdContainingNode(id, prevGroups);

    opts.groupController.setGroups([
      ...prevGroups,
      {
        id: groupId,
        parentId: parentId ? String(parentId) : null,
        name: String(def.name ?? 'Custom Node'),
        nodeIds: materializedIdsInGroup,
        disabled: !state.manualGate,
        minimized: false,
      },
    ]);

    opts.groupPortNodesController.ensureGroupPortNodes();
    opts.groupPortNodesController.scheduleAlign();

    // Rewire external connections from the collapsed Custom Node ports to the group boundary proxy nodes.
    const graph = opts.nodeEngine.exportGraph();
    const allConnections = Array.isArray(graph.connections) ? graph.connections : [];

    const portByKey = new Map((def.ports ?? []).map((p) => [String(p.portKey ?? ''), p] as const));

    const removed: Connection[] = [];
    for (const c of allConnections) {
      const connId = String(c.id ?? '');
      if (!connId) continue;
      const src = String(c.sourceNodeId ?? '');
      const tgt = String(c.targetNodeId ?? '');
      if (src !== id && tgt !== id) continue;
      removed.push(c);
      opts.nodeEngine.removeConnection(connId);
    }

    const index = opts.buildGroupPortIndex(opts.nodeEngine.exportGraph());
    const gateId = index.get(groupId)?.gateId ? String(index.get(groupId)?.gateId) : '';

    for (const c of removed) {
      const src = String(c.sourceNodeId ?? '');
      const srcPort = String(c.sourcePortId ?? '');
      const tgt = String(c.targetNodeId ?? '');
      const tgtPort = String(c.targetPortId ?? '');

      if (tgt === id && tgtPort === 'gate') {
        if (gateId) {
          const gateConn: Connection = {
            id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
            sourceNodeId: src,
            sourcePortId: srcPort,
            targetNodeId: gateId,
            targetPortId: 'active',
          };
          opts.nodeEngine.addConnection(gateConn);
        }
        continue;
      }

      if (tgt === id) {
        const port = portByKey.get(tgtPort);
        if (!port) continue;
        const boundInternalId = String(port?.binding?.nodeId ?? '');
        const boundPortId = String(port?.binding?.portId ?? '');
        if (!boundInternalId || !boundPortId) continue;
        const proxyNodeId = opts.materializeInternalNodeId(id, boundInternalId);
        const inboundConn: Connection = {
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: src,
          sourcePortId: srcPort,
          targetNodeId: proxyNodeId,
          targetPortId: boundPortId,
        };
        opts.nodeEngine.addConnection(inboundConn);
        continue;
      }

      if (src === id) {
        const port = portByKey.get(srcPort);
        if (!port) continue;
        const boundInternalId = String(port?.binding?.nodeId ?? '');
        const boundPortId = String(port?.binding?.portId ?? '');
        if (!boundInternalId || !boundPortId) continue;
        const proxyNodeId = opts.materializeInternalNodeId(id, boundInternalId);
        const outboundConn: Connection = {
          id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
          sourceNodeId: proxyNodeId,
          sourcePortId: boundPortId,
          targetNodeId: tgt,
          targetPortId: tgtPort,
        };
        opts.nodeEngine.addConnection(outboundConn);
        continue;
      }
    }

    opts.expandedCustomByGroupId.set(groupId, { groupId, nodeId: id });
    opts.forcedHiddenNodeIds.add(id);
    refreshExpandedCustomGroupIds();

    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
    opts.groupPortNodesController.scheduleNormalizeProxies();
  };

  const handleCollapseCustomNodeFrame = (groupId: string) => {
    const rootGroupId = String(groupId ?? '');
    if (!rootGroupId) return;

    const expanded = opts.expandedCustomByGroupId.get(rootGroupId) ?? null;
    if (!expanded) return;

    const motherNodeId = String(expanded.nodeId ?? '');
    if (!motherNodeId) return;

    const motherNode = opts.nodeEngine.getNode(motherNodeId);
    if (!motherNode) return;

    const motherState = opts.readCustomNodeState(motherNode?.config ?? {});
    if (!motherState || motherState.role !== 'mother') return;

    const def = opts.getCustomNodeDefinition(motherState.definitionId);
    if (!def) return;

    // Ensure boundary proxies are normalized before snapshotting ports.
    opts.groupPortNodesController.scheduleNormalizeProxies();
    opts.groupPortNodesController.ensureGroupPortNodes();
    opts.groupPortNodesController.scheduleAlign();

    const frames = get(opts.groupFrames) ?? [];
    const frame = frames.find((f) => String(f.group?.id ?? '') === rootGroupId) ?? null;
    const originX = frame ? Number(frame.left ?? 0) : Number(motherNode.position?.x ?? 0);
    const originY = frame ? Number(frame.top ?? 0) : Number(motherNode.position?.y ?? 0);

    const graph = opts.nodeEngine.exportGraph();
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph.connections) ? graph.connections : [];
    const nodeById = new Map(nodes.map((n) => [String(n.id), n] as const));

    const groupsSnapshot = get(opts.groupController.nodeGroups) ?? [];
    const subtreeGroupIds = new Set<string>();
    const stack = [rootGroupId];
    while (stack.length > 0) {
      const gid = String(stack.pop() ?? '');
      if (!gid || subtreeGroupIds.has(gid)) continue;
      subtreeGroupIds.add(gid);
      for (const g of groupsSnapshot) {
        if (String(g.parentId ?? '') !== gid) continue;
        stack.push(String(g.id ?? ''));
      }
    }

    const nodeIdsInSubtree = new Set<string>();
    for (const g of groupsSnapshot) {
      const gid = String(g.id ?? '');
      if (!gid || !subtreeGroupIds.has(gid)) continue;
      for (const nid of g.nodeIds ?? []) nodeIdsInSubtree.add(String(nid));
    }

    for (const n of nodes) {
      const type = String(n.type ?? '');
      if (!opts.isGroupPortNodeType(type) && type !== 'group-frame') continue;
      const gid = opts.groupIdFromNode(n);
      if (!gid || !subtreeGroupIds.has(String(gid))) continue;
      nodeIdsInSubtree.add(String(n.id ?? ''));
    }

    const internalNodeIdsForTemplate = new Set<string>();
    for (const id of nodeIdsInSubtree) {
      const node = nodeById.get(String(id));
      if (!node) continue;
      const type = String(node.type ?? '');
      if (type === 'group-gate' || type === 'group-frame' || type === 'group-activate') continue;
      internalNodeIdsForTemplate.add(String(id));
    }

    const internalIdForMain = (mainId: string): string => {
      return opts.isMaterializedInternalNodeId(motherNodeId, mainId)
        ? opts.internalNodeIdFromMaterialized(motherNodeId, mainId)
        : String(mainId);
    };

    const packedNodes: NodeInstance[] = [];
    for (const id of internalNodeIdsForTemplate) {
      const node = nodeById.get(String(id));
      if (!node) continue;
      const internalId = internalIdForMain(String(id));
      const pos = node.position ?? { x: 0, y: 0 };
      packedNodes.push({
        ...node,
        id: internalId,
        position: { x: Number(pos?.x ?? 0) - originX, y: Number(pos?.y ?? 0) - originY },
        outputValues: {},
      });
    }

    const packedConnections: Connection[] = connections
      .filter(
        (c) =>
          internalNodeIdsForTemplate.has(String(c.sourceNodeId)) &&
          internalNodeIdsForTemplate.has(String(c.targetNodeId)) &&
          Boolean(String(c.sourcePortId ?? '')) &&
          Boolean(String(c.targetPortId ?? ''))
      )
      .map((c) => ({
        ...c,
        sourceNodeId: internalIdForMain(String(c.sourceNodeId)),
        targetNodeId: internalIdForMain(String(c.targetNodeId)),
      }));

    // Derive Custom Node ports from root-level group-proxy nodes.
    const resolvePortLabel = (nodeType: string, side: 'input' | 'output', portId: string): string => {
      const def = opts.nodeRegistry.get(String(nodeType ?? ''));
      const ports = side === 'input' ? def?.inputs : def?.outputs;
      const port = (ports ?? []).find((p) => String(p.id) === String(portId)) ?? null;
      return String(port?.label ?? portId);
    };

    const validPortTypes = new Set([
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

    const ports: CustomNodeDefinition['ports'] = [];
    const rootProxyNodes = nodes.filter((n) => {
      if (String(n.type ?? '') !== 'group-proxy') return false;
      const gid = opts.groupIdFromNode(n);
      return String(gid ?? '') === rootGroupId;
    });

    for (const proxy of rootProxyNodes) {
      const proxyMainId = String(proxy.id ?? '');
      if (!proxyMainId) continue;
      if (
        !internalNodeIdsForTemplate.has(proxyMainId) &&
        !opts.isMaterializedInternalNodeId(motherNodeId, proxyMainId)
      ) {
        // It should still be removed as a group decoration node, but won't be part of the template.
      }

      const internalProxyId = internalIdForMain(proxyMainId);
      const config = asRecord(proxy.config);
      const directionRaw = getString(config.direction, 'output');
      const side: 'input' | 'output' = directionRaw === 'input' ? 'input' : 'output';
      const bindingPortId = side === 'input' ? 'in' : 'out';
      const portKey = `p:${internalProxyId}`;

      const portTypeRaw = getString(config.portType, 'any');
      const type = validPortTypes.has(portTypeRaw) ? portTypeRaw : 'any';
      const pinned = getBoolean(config.pinned, false);

      const pos = proxy.position ?? { x: 0, y: 0 };
      const y = Number(pos?.y ?? 0) - originY;

      const label = (() => {
        if (side === 'input') {
          const inner = packedConnections.find(
            (c) => String(c.sourceNodeId) === internalProxyId && String(c.sourcePortId) === 'out'
          );
          if (!inner) return 'In';
          const targetNode = packedNodes.find((n) => String(n.id) === String(inner.targetNodeId));
          if (!targetNode) return String(inner.targetPortId ?? 'In');
          return resolvePortLabel(String(targetNode.type), 'input', String(inner.targetPortId));
        }
        const inner = packedConnections.find(
          (c) => String(c.targetNodeId) === internalProxyId && String(c.targetPortId) === 'in'
        );
        if (!inner) return 'Out';
        const sourceNode = packedNodes.find((n) => String(n.id) === String(inner.sourceNodeId));
        if (!sourceNode) return String(inner.sourcePortId ?? 'Out');
        return resolvePortLabel(String(sourceNode.type), 'output', String(inner.sourcePortId));
      })();

      ports.push({
        portKey,
        side,
        label,
        type,
        pinned,
        y: Number.isFinite(y) ? y : 0,
        binding: { nodeId: internalProxyId, portId: bindingPortId },
      });
    }

    // Capture external wiring from boundary proxies (so we can reconnect to collapsed Custom Node ports).
    const mainInternalNodeIdSet = new Set<string>();
    for (const id of internalNodeIdsForTemplate) mainInternalNodeIdSet.add(String(id));
    for (const n of rootProxyNodes) {
      const id = String(n.id ?? '');
      if (id) mainInternalNodeIdSet.add(id);
    }

    const proxyPortKeyByMainId = new Map<string, string>();
    for (const n of rootProxyNodes) {
      const pid = String(n.id ?? '');
      if (!pid) continue;
      const internalProxyId = internalIdForMain(pid);
      proxyPortKeyByMainId.set(pid, `p:${internalProxyId}`);
    }

    const externalInputs: Array<{ sourceNodeId: string; sourcePortId: string; portKey: string }> = [];
    const externalOutputs: Array<{ targetNodeId: string; targetPortId: string; portKey: string }> = [];

    for (const c of connections) {
      const connId = String(c.id ?? '');
      const src = String(c.sourceNodeId ?? '');
      const srcPort = String(c.sourcePortId ?? '');
      const tgt = String(c.targetNodeId ?? '');
      const tgtPort = String(c.targetPortId ?? '');
      if (!connId || !src || !srcPort || !tgt || !tgtPort) continue;

      const portKey = proxyPortKeyByMainId.get(tgt);
      if (portKey && tgtPort === 'in' && !mainInternalNodeIdSet.has(src)) {
        externalInputs.push({ sourceNodeId: src, sourcePortId: srcPort, portKey });
        continue;
      }

      const outKey = proxyPortKeyByMainId.get(src);
      if (outKey && srcPort === 'out' && !mainInternalNodeIdSet.has(tgt)) {
        externalOutputs.push({ targetNodeId: tgt, targetPortId: tgtPort, portKey: outKey });
        continue;
      }
    }

    const gateNodeId =
      nodes.find(
        (n) =>
          String(n.type ?? '') === 'group-gate' &&
          getString(asRecord(n.config).groupId, '') === rootGroupId
      )?.id ?? '';

    const gateConn = (() => {
      if (!gateNodeId) return null;
      const c = connections.find(
        (c) =>
          String(c.targetNodeId ?? '') === String(gateNodeId) &&
          String(c.targetPortId ?? '') === 'active' &&
          !mainInternalNodeIdSet.has(String(c.sourceNodeId ?? ''))
      );
      return c
        ? {
            sourceNodeId: String(c.sourceNodeId),
            sourcePortId: String(c.sourcePortId),
          }
        : null;
    })();

    // Update definition + mother internal state; children sync happens in Phase 2.5.7.
    const nextDefinition: CustomNodeDefinition = {
      ...def,
      name: String(
        groupsSnapshot.find((g) => String(g.id ?? '') === rootGroupId)?.name ?? def.name ?? def.name
      ),
      template: { nodes: packedNodes, connections: packedConnections },
      ports,
    };

    {
      const defs = get(opts.customNodeDefinitions) ?? [];
      const nextDefs = defs.map((d) =>
        String(d.definitionId ?? '') === String(nextDefinition.definitionId) ? nextDefinition : d
      );
      const inCycle = opts.definitionsInCycles(nextDefs);
      if (inCycle.size > 0) {
        const ids = Array.from(inCycle).map(String).filter(Boolean);
        const msg = `Cyclic Custom Node nesting is not allowed.\n\nCycle detected: ${ids.join(' → ')}`;
        opts.nodeEngine.lastError?.set?.(msg);
        alert(msg);
        return;
      }
    }
    opts.upsertCustomNodeDefinition(nextDefinition);

    opts.nodeEngine.updateNodePosition(motherNodeId, { x: originX, y: originY });
    opts.nodeEngine.updateNodeConfig(
      motherNodeId,
      opts.writeCustomNodeState(motherNode?.config ?? {}, {
        ...motherState,
        manualGate: !groupsSnapshot.find((g) => String(g.id ?? '') === rootGroupId)?.disabled,
        internal: { nodes: packedNodes, connections: packedConnections },
      })
    );
    opts.nodeEngine.updateNodeInputValue(
      motherNodeId,
      'gate',
      !groupsSnapshot.find((g) => String(g.id ?? '') === rootGroupId)?.disabled
    );

    opts.syncCoupledCustomNodesForDefinition(nextDefinition.definitionId);

    // Remove the expanded frame group subtree.
    opts.groupController.setGroups(
      groupsSnapshot.filter((g) => !subtreeGroupIds.has(String(g.id ?? '')))
    );

    // Remove all materialized/internal nodes + group decoration nodes for this subtree.
    for (const id of Array.from(nodeIdsInSubtree)) {
      if (!id) continue;
      if (id === motherNodeId) continue;
      opts.nodeEngine.removeNode(String(id));
    }

    // Reconnect external wiring back to the collapsed Custom Node ports.
    for (const entry of externalInputs) {
      const nextConn: Connection = {
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: entry.sourceNodeId,
        sourcePortId: entry.sourcePortId,
        targetNodeId: motherNodeId,
        targetPortId: entry.portKey,
      };
      opts.nodeEngine.addConnection(nextConn);
    }
    for (const entry of externalOutputs) {
      const nextConn: Connection = {
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: motherNodeId,
        sourcePortId: entry.portKey,
        targetNodeId: entry.targetNodeId,
        targetPortId: entry.targetPortId,
      };
      opts.nodeEngine.addConnection(nextConn);
    }
    if (gateConn) {
      const nextConn: Connection = {
        id: `conn-${crypto.randomUUID?.() ?? Date.now()}`,
        sourceNodeId: gateConn.sourceNodeId,
        sourcePortId: gateConn.sourcePortId,
        targetNodeId: motherNodeId,
        targetPortId: 'gate',
      };
      opts.nodeEngine.addConnection(nextConn);
    }

    opts.expandedCustomByGroupId.delete(rootGroupId);
    opts.forcedHiddenNodeIds.delete(motherNodeId);
    refreshExpandedCustomGroupIds();

    opts.groupController.scheduleHighlight();
    opts.requestFramesUpdate();
    opts.groupPortNodesController.scheduleNormalizeProxies();
  };

  return {
    refreshExpandedCustomGroupIds,
    getExpandedGroupIds: () => new Set(expandedCustomGroupIds),
    rehydrateExpandedCustomFrames,
    handleExpandCustomNode,
    handleCollapseCustomNodeFrame,
  };
};
