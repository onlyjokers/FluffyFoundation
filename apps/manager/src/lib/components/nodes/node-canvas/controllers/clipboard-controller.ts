/**
 * Purpose: Clipboard (copy/paste) handling for NodeCanvas.
 */

import { get } from 'svelte/store';
import type { Connection as EngineConnection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { GraphViewAdapter } from '../adapters';
import type { GroupController, NodeGroup } from './group-controller';
import type { NodeEngine } from '$lib/nodes/engine';
import { groupIdFromNode, isGroupPortNodeType } from '../utils/group-port-utils';
import {
  cloneInternalGraphForNewInstance,
  generateCustomNodeGroupId,
  readCustomNodeState,
  writeCustomNodeState,
} from '$lib/nodes/custom-nodes/instance';

export type ClipboardController = {
  copySelectedNodes: () => boolean;
  pasteCopiedNodes: () => boolean;
};

export type CreateClipboardControllerOptions = {
  getContainer: () => HTMLDivElement | null;
  nodeEngine: NodeEngine;
  adapter: GraphViewAdapter;
  getGraphState: () => GraphState;
  getNodeCount: () => number;
  getSelectedNodeId: () => string;
  setSelectedNode: (nodeId: string) => void;
  groupController: GroupController;
  getLastPointerClient: () => { x: number; y: number };
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  generateId: () => string;
};

export function createClipboardController(opts: CreateClipboardControllerOptions): ClipboardController {
  const {
    getContainer,
    nodeEngine,
    adapter,
    getGraphState,
    getNodeCount,
    getSelectedNodeId,
    setSelectedNode,
    groupController,
    getLastPointerClient,
    computeGraphPosition,
    generateId,
  } = opts;

  let clipboardNodes: NodeInstance[] = [];
  // Track internal connections so paste can restore them.
  let clipboardConnections: EngineConnection[] = [];
  let clipboardKind: 'nodes' | 'group' = 'nodes';
  let clipboardGroups: NodeGroup[] = [];
  let clipboardRootGroupId: string | null = null;
  let clipboardPasteIndex = 0;

  const rewriteCustomNodeConfigForPaste = (config: Record<string, unknown>): Record<string, unknown> => {
    const state = readCustomNodeState(config);
    if (!state) return config;

    const groupId = generateCustomNodeGroupId();
    return writeCustomNodeState(config, {
      ...state,
      groupId,
      role: 'child',
      internal: cloneInternalGraphForNewInstance(state.internal, groupId),
    });
  };

  const cloneNodeInstance = (
    node: NodeInstance,
    positionOverride?: { x: number; y: number } | null
  ): NodeInstance => ({
    id: String(node.id),
    type: node.type,
    position: {
      x: Number(positionOverride?.x ?? node.position?.x ?? 0),
      y: Number(positionOverride?.y ?? node.position?.y ?? 0),
    },
    config: { ...(node.config ?? {}) },
    inputValues: { ...(node.inputValues ?? {}) },
    outputValues: { ...(node.outputValues ?? {}) },
  });

  const collectCopySelection = (): { nodes: NodeInstance[]; ids: string[] } => {
    const selected = get(groupController.groupSelectionNodeIds);
    const selectedNodeId = String(getSelectedNodeId() ?? '');
    const ids =
      selected.size > 0
        ? Array.from(selected).map(String)
        : selectedNodeId
          ? [selectedNodeId]
          : [];
    if (ids.length === 0) return { nodes: [], ids: [] };

    const graphState = getGraphState();
    const nodeById = new Map((graphState.nodes ?? []).map((node) => [String(node.id), node]));
    const nodes = ids.map((id) => nodeById.get(id)).filter(Boolean) as NodeInstance[];

    return {
      nodes: nodes.map((node) => cloneNodeInstance(node, adapter.getNodePosition(String(node.id)))),
      ids,
    };
  };

  const collectGroupSubtreeIds = (rootGroupId: string, groups: NodeGroup[]): string[] => {
    const childrenByParentId = new Map<string, string[]>();
    for (const group of groups) {
      const parentId = group.parentId ? String(group.parentId) : '';
      if (!parentId) continue;
      const list = childrenByParentId.get(parentId) ?? [];
      list.push(String(group.id));
      childrenByParentId.set(parentId, list);
    }

    const ids: string[] = [];
    const visited = new Set<string>();
    const stack = [String(rootGroupId)];
    while (stack.length > 0) {
      const current = String(stack.pop() ?? '');
      if (!current || visited.has(current)) continue;
      visited.add(current);
      ids.push(current);
      for (const childId of childrenByParentId.get(current) ?? []) stack.push(String(childId));
    }

    return ids;
  };

  const collectCopySelectedGroup = (): {
    rootGroupId: string;
    groups: NodeGroup[];
    nodes: NodeInstance[];
    nodeIds: string[];
    connections: EngineConnection[];
  } | null => {
    const rootGroupId = String(get(groupController.selectedGroupId) ?? '');
    if (!rootGroupId) return null;

    const groupsSnapshot = get(groupController.nodeGroups) ?? [];
    const byId = new Map(groupsSnapshot.map((g) => [String(g.id), g] as const));
    const root = byId.get(rootGroupId);
    if (!root) return null;

    const subtreeIds = collectGroupSubtreeIds(rootGroupId, groupsSnapshot);
    const subtreeSet = new Set(subtreeIds);

    const groups: NodeGroup[] = subtreeIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((g) => ({
        id: String(g!.id),
        parentId: g!.parentId ? String(g!.parentId) : null,
        name: String(g!.name ?? ''),
        nodeIds: (g!.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean),
        disabled: Boolean(g!.disabled),
        minimized: Boolean(g!.minimized),
      }));

    const graphState = getGraphState();
    const nodeById = new Map((graphState.nodes ?? []).map((node) => [String(node.id), node] as const));

    const nodeIdSet = new Set<string>();
    for (const g of groups) {
      for (const nid of g.nodeIds ?? []) nodeIdSet.add(String(nid));
    }

    for (const node of graphState.nodes ?? []) {
      const type = String(node.type ?? '');
      if (!isGroupPortNodeType(type)) continue;
      const groupId = groupIdFromNode(node);
      if (!groupId || !subtreeSet.has(String(groupId))) continue;
      nodeIdSet.add(String(node.id));
    }

    const nodeIds = Array.from(nodeIdSet);
    const nodes = nodeIds.map((id) => nodeById.get(id)).filter(Boolean) as NodeInstance[];

    const clonedNodes = nodes.map((node) => cloneNodeInstance(node, adapter.getNodePosition(String(node.id))));
    const connections = collectCopyConnections(nodeIds);

    return { rootGroupId, groups, nodes: clonedNodes, nodeIds, connections };
  };

  const collectCopyConnections = (ids: string[]): EngineConnection[] => {
    const set = new Set(ids.map(String));
    const state = getGraphState();
    return (state.connections ?? [])
      .filter((c) => set.has(String(c.sourceNodeId)) && set.has(String(c.targetNodeId)))
      .map((c) => ({
        id: String(c.id),
        sourceNodeId: String(c.sourceNodeId),
        sourcePortId: String(c.sourcePortId),
        targetNodeId: String(c.targetNodeId),
        targetPortId: String(c.targetPortId),
      }));
  };

  const copySelectedNodes = () => {
    const { nodes, ids } = collectCopySelection();
    if (nodes.length > 0) {
      clipboardKind = 'nodes';
      clipboardGroups = [];
      clipboardRootGroupId = null;
      clipboardNodes = nodes;
      clipboardConnections = collectCopyConnections(ids);
      clipboardPasteIndex = 0;
      return true;
    }

    const groupCopy = collectCopySelectedGroup();
    if (!groupCopy) return false;

    clipboardKind = 'group';
    clipboardGroups = groupCopy.groups;
    clipboardRootGroupId = groupCopy.rootGroupId;
    clipboardNodes = groupCopy.nodes;
    clipboardConnections = groupCopy.connections;
    clipboardPasteIndex = 0;
    return true;
  };

  const computePasteAnchor = () => {
    const container = getContainer();
    if (!container) {
      const count = getNodeCount();
      return { x: 120 + count * 10, y: 120 + count * 6 };
    }
    const rect = container.getBoundingClientRect();
    const pointer = getLastPointerClient();
    const within =
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom;
    if (within) return computeGraphPosition(pointer.x, pointer.y);
    return computeGraphPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const pasteCopiedNodes = () => {
    if (clipboardNodes.length === 0) return false;

    const anchor = computePasteAnchor();
    if (clipboardKind === 'group' && clipboardGroups.length > 0 && clipboardRootGroupId) {
      const groupRoot = String(clipboardRootGroupId);
      const groupIdMap = new Map<string, string>();
      const newGroupId = () => `group:${crypto.randomUUID?.() ?? Date.now()}`;
      for (const g of clipboardGroups) groupIdMap.set(String(g.id), newGroupId());

      const placementNodes = clipboardNodes.filter((node) => !isGroupPortNodeType(String(node.type ?? '')));
      const positions = (placementNodes.length > 0 ? placementNodes : clipboardNodes).map((node) => node.position);

      const minX = Math.min(...positions.map((p) => p.x));
      const minY = Math.min(...positions.map((p) => p.y));
      const maxX = Math.max(...positions.map((p) => p.x));
      const maxY = Math.max(...positions.map((p) => p.y));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const nudge = clipboardPasteIndex * 28;
      const offsetX = anchor.x - centerX + nudge;
      const offsetY = anchor.y - centerY + nudge;

      const idMap = new Map<string, string>();
      const newNodeIds: string[] = [];

      groupController.clearSelection();
      setSelectedNode('');

      for (const node of clipboardNodes) {
        const newId = generateId();
        const position = { x: node.position.x + offsetX, y: node.position.y + offsetY };
        let config: Record<string, unknown> = { ...(node.config ?? {}) };

        if (isGroupPortNodeType(String(node.type ?? ''))) {
          const oldGroupId = config.groupId ? String(config.groupId) : '';
          const mapped = oldGroupId ? groupIdMap.get(oldGroupId) : null;
          if (mapped) config.groupId = mapped;
        }

        config = rewriteCustomNodeConfigForPaste(config);

        const newNode: NodeInstance = {
          id: newId,
          type: node.type,
          position,
          config,
          inputValues: { ...(node.inputValues ?? {}) },
          outputValues: { ...(node.outputValues ?? {}) },
        };

        nodeEngine.addNode(newNode);
        idMap.set(String(node.id), newId);
        newNodeIds.push(newId);
      }

      for (const conn of clipboardConnections) {
        const sourceNodeId = idMap.get(String(conn.sourceNodeId));
        const targetNodeId = idMap.get(String(conn.targetNodeId));
        if (!sourceNodeId || !targetNodeId) continue;
        const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
        const engineConn: EngineConnection = {
          id: connId,
          sourceNodeId,
          sourcePortId: String(conn.sourcePortId),
          targetNodeId,
          targetPortId: String(conn.targetPortId),
        };
        nodeEngine.addConnection(engineConn);
      }

      const newGroupsRaw: NodeGroup[] = clipboardGroups.map((g) => {
        const oldId = String(g.id ?? '');
        const id = groupIdMap.get(oldId) ?? newGroupId();

        const oldParentId = g.parentId ? String(g.parentId) : null;
        const parentId =
          oldId === groupRoot
            ? null
            : oldParentId && groupIdMap.has(oldParentId)
              ? groupIdMap.get(oldParentId)!
              : null;

        const nodeIds = Array.from(
          new Set(
            (g.nodeIds ?? [])
              .map((nid) => idMap.get(String(nid)))
              .filter(Boolean) as string[]
          )
        );

        return {
          id,
          parentId,
          name: String(g.name ?? ''),
          nodeIds,
          disabled: Boolean(g.disabled),
          minimized: Boolean(g.minimized),
          runtimeActive: true,
        };
      });

      // Ensure groups are appended parents-first so bounds and disabled propagation are stable.
      const byId = new Map(newGroupsRaw.map((g) => [String(g.id), g] as const));
      const depthCache = new Map<string, number>();
      const getDepth = (groupId: string, visiting = new Set<string>()): number => {
        const cached = depthCache.get(groupId);
        if (cached !== undefined) return cached;
        if (visiting.has(groupId)) return 0;
        visiting.add(groupId);
        const g = byId.get(groupId);
        const parentId = g?.parentId && byId.has(String(g.parentId)) ? String(g.parentId) : null;
        const depth = parentId ? getDepth(parentId, visiting) + 1 : 0;
        visiting.delete(groupId);
        depthCache.set(groupId, depth);
        return depth;
      };

      const newGroups = [...newGroupsRaw].sort((a, b) => getDepth(String(a.id)) - getDepth(String(b.id)));
      groupController.appendGroups(newGroups);

      const rootNewId = groupIdMap.get(groupRoot);
      if (rootNewId) groupController.selectedGroupId.set(rootNewId);

      clipboardPasteIndex += 1;
      return true;
    }

    const positions = clipboardNodes.map((node) => node.position);
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x));
    const maxY = Math.max(...positions.map((p) => p.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const nudge = clipboardPasteIndex * 28;
    const offsetX = anchor.x - centerX + nudge;
    const offsetY = anchor.y - centerY + nudge;

    const newIds: string[] = [];
    const idMap = new Map<string, string>();
    for (const node of clipboardNodes) {
      const newId = generateId();
      const position = { x: node.position.x + offsetX, y: node.position.y + offsetY };
      const config = rewriteCustomNodeConfigForPaste({ ...(node.config ?? {}) });
      const newNode: NodeInstance = {
        id: newId,
        type: node.type,
        position,
        config,
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: { ...(node.outputValues ?? {}) },
      };
      nodeEngine.addNode(newNode);
      groupController.autoAddNodeToGroupFromPosition(newId, position);
      newIds.push(newId);
      idMap.set(String(node.id), newId);
    }

    if (clipboardConnections.length > 0 && idMap.size > 0) {
      for (const conn of clipboardConnections) {
        const sourceNodeId = idMap.get(String(conn.sourceNodeId));
        const targetNodeId = idMap.get(String(conn.targetNodeId));
        if (!sourceNodeId || !targetNodeId) continue;
        const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
        const engineConn: EngineConnection = {
          id: connId,
          sourceNodeId,
          sourcePortId: String(conn.sourcePortId),
          targetNodeId,
          targetPortId: String(conn.targetPortId),
        };
        nodeEngine.addConnection(engineConn);
      }
    }

    clipboardPasteIndex += 1;

    if (newIds.length === 1) {
      groupController.clearSelection();
      setSelectedNode(newIds[0] ?? '');
    } else if (newIds.length > 1) {
      groupController.groupSelectionNodeIds.set(new Set(newIds));
      groupController.scheduleHighlight();
      groupController.requestFramesUpdate();
    }

    return true;
  };

  return { copySelectedNodes, pasteCopiedNodes };
}
