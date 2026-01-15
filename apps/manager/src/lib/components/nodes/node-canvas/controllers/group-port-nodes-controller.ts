/**
 * Purpose: Maintain Group Port nodes (ensure they exist, align them to frames, and sync runtime active gates).
 */

import { get } from 'svelte/store';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import type { GraphViewAdapter } from '../adapters';
import type { GroupController, NodeGroup } from './group-controller';
import type { NodeEngine } from '$lib/nodes/engine';
import {
  buildGroupPortIndex,
  groupIdFromNode,
  isGroupPortNodeType,
  GROUP_GATE_NODE_TYPE,
  GROUP_PROXY_NODE_TYPE,
} from '../utils/group-port-utils';

const GROUP_FRAME_NODE_TYPE = 'group-frame';
const isGroupDecorationNodeType = (type: string) => isGroupPortNodeType(type) || type === GROUP_FRAME_NODE_TYPE;

export type GroupPortNodesController = {
  ensureGroupPortNodes: () => void;
  scheduleAlign: () => void;
  scheduleNormalizeProxies: () => void;
  updateRuntimeActives: () => void;
  removeGroupPortNodesForGroupIds: (groupIds: string[]) => number;
  disassembleGroupAndPorts: (groupId: string) => void;
  destroy: () => void;
};

export type CreateGroupPortNodesControllerOptions = {
  nodeEngine: NodeEngine;
  nodeRegistry: NodeRegistry;
  adapter: GraphViewAdapter;
  groupController: GroupController;
  getNodeCount: () => number;
  generateId: () => string;
};

type AnyRecord = Record<string, unknown>;

export function createGroupPortNodesController(
  opts: CreateGroupPortNodesControllerOptions
): GroupPortNodesController {
  const { nodeEngine, nodeRegistry, adapter, groupController, getNodeCount, generateId } = opts;

  let alignRaf = 0;
  let normalizeRaf = 0;
  let isNormalizing = false;
  const generateConnId = () => `conn-${crypto.randomUUID?.() ?? Date.now()}`;

  const addNode = (
    type: string,
    position: { x: number; y: number },
    configPatch?: Record<string, unknown> | null
  ): string => {
    const def = nodeRegistry.get(type);
    if (!def) return '';

    const config: Record<string, unknown> = {};
    for (const field of def.configSchema) config[field.key] = field.defaultValue;

    const instance: NodeInstance = {
      id: generateId(),
      type,
      position,
      config: { ...config, ...(configPatch ?? {}) },
      inputValues: {},
      outputValues: {},
    };

    nodeEngine.addNode(instance);
    return instance.id;
  };

  const computeGroupNodeBounds = (group: NodeGroup, state: GraphState) => {
    const ids = Array.isArray(group?.nodeIds) ? group.nodeIds.map(String).filter(Boolean) : [];
    if (ids.length === 0) return null;

    const nodeById = new Map((state.nodes ?? []).map((n) => [String(n.id), n]));

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const id of ids) {
      const node = nodeById.get(id);
      if (!node) continue;
      const x = Number(node.position?.x ?? 0);
      const y = Number(node.position?.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const ok =
      Number.isFinite(minX) &&
      Number.isFinite(maxX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxY);
    if (!ok) return null;

    return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  };

  const addGroupPortNode = (type: string, groupId: string, position: { x: number; y: number }) => {
    return addNode(type, position, { groupId });
  };

  const addConnection = (
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ) => {
    if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return false;
    return nodeEngine.addConnection({
      id: generateConnId(),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    });
  };

  const migrateLegacyGroupActivateNodes = () => {
    const groups = get(groupController.nodeGroups);
    if (groups.length === 0) return;

    const state = nodeEngine.exportGraph() as GraphState;
    const index = buildGroupPortIndex(state);
    const groupsById = new Map(groups.map((g) => [String(g.id), g] as const));

    const nodeById = new Map((state.nodes ?? []).map((n: AnyRecord) => [String(n.id), n]));
    const incomingByTargetKey = new Map<string, { sourceNodeId: string; sourcePortId: string }>();
    for (const c of state.connections ?? []) {
      const key = `${String(c.targetNodeId)}:${String(c.targetPortId)}`;
      incomingByTargetKey.set(key, { sourceNodeId: String(c.sourceNodeId), sourcePortId: String(c.sourcePortId) });
    }

    let groupsChanged = false;
    const nextGroups = groups.map((g) => ({ ...g }));
    const nextGroupById = new Map(nextGroups.map((g) => [String(g.id), g] as const));

    for (const [groupId, ports] of index.entries()) {
      const legacyIds = ports.legacyActivateIds ?? [];
      if (legacyIds.length === 0) continue;
      const group = groupsById.get(groupId);
      if (!group) continue;

      const frame = get(groupController.groupFrames).find((f) => String(f.group?.id ?? '') === groupId) ?? null;
      const hintX = frame ? frame.left : 120 + getNodeCount() * 10;
      const hintY = frame ? frame.top : 120 + getNodeCount() * 6;

      const gateId =
        ports.gateId ||
        addGroupPortNode(GROUP_GATE_NODE_TYPE, groupId, { x: hintX - 140, y: hintY - 20 });
      if (!gateId) continue;

      // Collect wired conditions (connections) and manual conditions (unconnected toggles).
      const wired: { sourceNodeId: string; sourcePortId: string }[] = [];
      let manualAllTrue = true;

      for (const legacyId of legacyIds) {
        const legacyNode = nodeById.get(String(legacyId));
        if (!legacyNode) continue;

        const incoming = incomingByTargetKey.get(`${String(legacyId)}:active`) ?? null;
        if (incoming) {
          wired.push({ sourceNodeId: incoming.sourceNodeId, sourcePortId: incoming.sourcePortId });
          continue;
        }

        const raw = (legacyNode as AnyRecord)?.inputValues?.active;
        const manualActive =
          typeof raw === 'boolean'
            ? raw
            : typeof raw === 'number' && Number.isFinite(raw)
              ? raw >= 0.5
              : true;
        manualAllTrue = manualAllTrue && manualActive;
      }

      if (!manualAllTrue) {
        const rec = nextGroupById.get(groupId);
        if (rec && !rec.disabled) {
          rec.disabled = true;
          groupsChanged = true;
        }
      }

      // Remove any existing incoming connection to the new gate node so we can rewire deterministically.
      for (const c of state.connections ?? []) {
        if (String(c.targetNodeId) === String(gateId) && String(c.targetPortId) === 'active') {
          nodeEngine.removeConnection(String(c.id));
        }
      }

      if (wired.length > 0) {
        const coerceToBool = (source: { sourceNodeId: string; sourcePortId: string }) => {
          const sourceNode = nodeById.get(source.sourceNodeId);
          const sourceDef = sourceNode ? nodeRegistry.get(String((sourceNode as AnyRecord).type ?? '')) : null;
          const portDef = sourceDef?.outputs?.find((p: AnyRecord) => String(p.id) === String(source.sourcePortId)) ?? null;
          const portType = String((portDef as AnyRecord)?.type ?? 'any');
          if (portType === 'boolean') return { nodeId: source.sourceNodeId, portId: source.sourcePortId };

          const convId = addNode('logic-number-to-boolean', { x: hintX - 260, y: hintY - 20 });
          if (!convId) return { nodeId: source.sourceNodeId, portId: source.sourcePortId };
          addConnection(source.sourceNodeId, source.sourcePortId, convId, 'number');
          return { nodeId: convId, portId: 'out' };
        };

        const boolSources = wired.map(coerceToBool);

        let current = boolSources[0] ?? null;
        for (let i = 1; i < boolSources.length; i += 1) {
          const next = boolSources[i];
          if (!current) {
            current = next;
            continue;
          }
          const andId = addNode('logic-and', { x: hintX - 200, y: hintY + i * 44 });
          if (!andId) continue;
          addConnection(current.nodeId, current.portId, andId, 'a');
          addConnection(next.nodeId, next.portId, andId, 'b');
          current = { nodeId: andId, portId: 'out' };
        }

        if (current) {
          addConnection(current.nodeId, current.portId, String(gateId), 'active');
        }
      }

      // Finally, remove legacy nodes (connections are removed automatically).
      for (const legacyId of legacyIds) {
        nodeEngine.removeNode(String(legacyId));
      }
    }

    if (groupsChanged) {
      groupController.setGroups(nextGroups);
    }
  };

  const ensureGroupPortNodes = () => {
    const groups = get(groupController.nodeGroups);
    if (groups.length === 0) return;

    migrateLegacyGroupActivateNodes();

    const state = nodeEngine.exportGraph() as GraphState;
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const connections = Array.isArray((state as AnyRecord).connections) ? (state as AnyRecord).connections : [];
    const nodeById = new Map(nodes.map((n: AnyRecord) => [String((n as AnyRecord)?.id ?? ''), n] as const));

    // Minimized Group frames are represented as a dedicated UI node (`group-frame`),
    // so the minimized state behaves like a standard node in the canvas.
    const existingFrameNodeIdByGroupId = new Map<string, string>();
    const gateNodeIdsByGroupId = new Map<string, string[]>();
    for (const node of nodes) {
      const type = String((node as AnyRecord).type ?? '');
      const gid = groupIdFromNode(node as AnyRecord);
      if (!gid) continue;

      if (type === GROUP_FRAME_NODE_TYPE) {
        const id = String((node as AnyRecord).id ?? '');
        if (!id) continue;
        // Keep only one group-frame node per group.
        if (!existingFrameNodeIdByGroupId.has(gid)) existingFrameNodeIdByGroupId.set(gid, id);
        else nodeEngine.removeNode(id);
      }

      if (type === GROUP_GATE_NODE_TYPE) {
        const id = String((node as AnyRecord).id ?? '');
        if (!id) continue;
        const list = gateNodeIdsByGroupId.get(gid) ?? [];
        list.push(id);
        gateNodeIdsByGroupId.set(gid, list);
      }
    }

    const groupIdSet = new Set(groups.map((g: AnyRecord) => String((g as AnyRecord).id ?? '')).filter(Boolean));

    for (const [gid, nodeId] of existingFrameNodeIdByGroupId.entries()) {
      if (!gid || !nodeId) continue;
      if (!groupIdSet.has(gid)) nodeEngine.removeNode(nodeId);
    }

    // Remove Group Gate nodes whose group no longer exists.
    for (const [gid, ids] of gateNodeIdsByGroupId.entries()) {
      if (!gid || groupIdSet.has(gid)) continue;
      for (const id of ids ?? []) {
        if (!id) continue;
        nodeEngine.removeNode(String(id));
      }
    }

    // Keep only one Group Gate node per group (dedupe stale historical nodes).
    for (const [gid, ids] of gateNodeIdsByGroupId.entries()) {
      const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
      if (!groupIdSet.has(gid)) continue;
      if (list.length <= 1) continue;
      const incomingCounts = new Map<string, number>();
      for (const c of connections) {
        if (String((c as AnyRecord).targetPortId ?? '') !== 'active') continue;
        const targetId = String((c as AnyRecord).targetNodeId ?? '');
        if (!targetId) continue;
        if (!list.includes(targetId)) continue;
        incomingCounts.set(targetId, (incomingCounts.get(targetId) ?? 0) + 1);
      }
      const keepId =
        list.find((id) => (incomingCounts.get(id) ?? 0) > 0) ??
        list[0] ??
        '';
      for (const id of list) {
        if (!id || id === keepId) continue;
        nodeEngine.removeNode(id);
      }
    }

    for (const group of groups) {
      const groupId = String((group as AnyRecord)?.id ?? '');
      if (!groupId) continue;

      const minimized = Boolean((group as AnyRecord)?.minimized);
      const existingFrameNodeId = existingFrameNodeIdByGroupId.get(groupId) ?? '';

      if (!minimized) {
        if (existingFrameNodeId) nodeEngine.removeNode(existingFrameNodeId);
        continue;
      }

      if (existingFrameNodeId) {
        const frameNode = nodeById.get(existingFrameNodeId) as AnyRecord;
        const desiredName = String((group as AnyRecord)?.name ?? 'Group');
        const desiredDisabled = Boolean((group as AnyRecord)?.disabled);

        const patch: Record<string, unknown> = {};
        const currentName = String((frameNode?.config as AnyRecord)?.name ?? '');
        const currentDisabled = Boolean((frameNode?.config as AnyRecord)?.disabled);

        if (desiredName && desiredName !== currentName) patch.name = desiredName;
        if (desiredDisabled !== currentDisabled) patch.disabled = desiredDisabled;

        if (Object.keys(patch).length > 0) nodeEngine.updateNodeConfig(existingFrameNodeId, patch);
        continue;
      }

      const bounds = computeGroupNodeBounds(group, state);
      const count = getNodeCount();
      const centerX = bounds ? bounds.centerX : 120 + count * 10;
      const centerY = bounds ? bounds.centerY : 120 + count * 6;

      const proxyNodes = nodes.filter(
        (n: AnyRecord) =>
          String((n as AnyRecord).type ?? '') === GROUP_PROXY_NODE_TYPE &&
          String(((n as AnyRecord).config as AnyRecord)?.groupId ?? '') === groupId
      );
      const inputProxyCount = proxyNodes.filter(
        (n: AnyRecord) => String(((n as AnyRecord).config as AnyRecord)?.direction ?? 'output') === 'input'
      ).length;
      const outputProxyCount = Math.max(0, proxyNodes.length - inputProxyCount);
      const portRows = Math.max(1, Math.max(inputProxyCount, outputProxyCount));

      const width = 230;
      const headerHeight = 44;
      const rowHeight = 28;
      const height = Math.max(84, headerHeight + portRows * rowHeight + 12);

      addNode(
        GROUP_FRAME_NODE_TYPE,
        { x: centerX - width / 2, y: centerY - height / 2 },
        {
          groupId,
          name: String((group as AnyRecord)?.name ?? 'Group'),
          disabled: Boolean((group as AnyRecord)?.disabled),
        }
      );
    }

    const index = buildGroupPortIndex(state);

    for (const group of groups) {
      const groupId = String(group?.id ?? '');
      if (!groupId) continue;
      const existing = index.get(groupId) ?? { legacyActivateIds: [], proxyIds: [] };
      if (existing.gateId) continue;

      const bounds = computeGroupNodeBounds(group, state);
      const count = getNodeCount();
      const baseX = bounds ? bounds.centerX : 120 + count * 10;
      const baseY = bounds ? bounds.centerY : 120 + count * 6;
      const leftX = bounds ? bounds.minX : baseX;

      if (!existing.gateId) {
        addGroupPortNode(GROUP_GATE_NODE_TYPE, groupId, { x: leftX - 140, y: baseY - 20 });
      }
    }
  };

  const alignGroupPortNodes = () => {
    const frames = get(groupController.groupFrames);
    if (frames.length === 0) return;

    const state = nodeEngine.exportGraph() as GraphState;
    const index = buildGroupPortIndex(state);
    const nodeById = new Map((state.nodes ?? []).map((n: AnyRecord) => [String(n.id), n]));
    const connections = Array.isArray(state.connections) ? state.connections : [];

    const PROXY_NODE_WIDTH = 48;
    const PROXY_NODE_HALF_HEIGHT = 10;
    const PROXY_MIN_SPACING = 20;
    const PROXY_SOCKET_OUTSET = 10;
    const PROXY_EDGE_NUDGE = 12;

    groupController.beginProgrammaticTranslate();
    try {
      for (const frame of frames) {
        const groupId = String(frame.group?.id ?? '');
        if (!groupId) continue;
        const ports = index.get(groupId);
        if (!ports) continue;

        const centerY = frame.top + frame.height / 2;
        const isMinimized = Boolean((frame as AnyRecord)?.group?.minimized);

        if (ports.gateId) {
          const nodeId = String(ports.gateId);
          // Place the Gate port next to the group header title, as an intrinsic group attribute.
          // Note: offsets must match `GroupFramesOverlay.svelte` header layout (graph coordinates).
          const headerLeft = frame.left + (isMinimized ? 12 : 18);
          const headerTop = frame.top + 12;
          const desiredX = headerLeft;
          const desiredY = headerTop + 4;
          const cur = adapter.getNodePosition(nodeId);
          if (!cur || Math.abs(cur.x - desiredX) > 1 || Math.abs(cur.y - desiredY) > 1) {
            adapter.setNodePosition(nodeId, desiredX, desiredY);
          }
        }

        const proxyIds = Array.isArray((ports as AnyRecord).proxyIds) ? (ports as AnyRecord).proxyIds : [];
        if (proxyIds.length > 0) {
          const minimizedHeaderHeight = 44;
          const minimizedRowHeight = 28;
          const minimizedPad = 6;

          const pad = (() => {
            const h = Number(frame.height ?? 0);
            if (!Number.isFinite(h) || h <= 0) return 56;
            const halfMinus = Math.max(0, h / 2 - 18);
            return Math.max(24, Math.min(56, halfMinus));
          })();

          const minCenterY = isMinimized
            ? frame.top + minimizedHeaderHeight + minimizedPad + minimizedRowHeight / 2
            : frame.top + pad;
          const maxCenterY = isMinimized
            ? frame.top + frame.height - minimizedPad - minimizedRowHeight / 2
            : frame.top + frame.height - pad;

          const clampCenterY = (y: number) => {
            if (!Number.isFinite(y)) return centerY;
            if (!Number.isFinite(minCenterY) || !Number.isFinite(maxCenterY) || maxCenterY <= minCenterY) return centerY;
            return Math.max(minCenterY, Math.min(maxCenterY, y));
          };

          const nodeCenterY = (nodeId: string) => {
            const b = adapter.getNodeBounds(String(nodeId));
            if (b) return (b.top + b.bottom) / 2;
            const pos = adapter.getNodePosition(String(nodeId));
            return pos ? pos.y : centerY;
          };

          type ProxyItem = {
            id: string;
            direction: 'input' | 'output';
            pinned: boolean;
            desiredCenterY: number;
          };

          const inputSide: ProxyItem[] = [];
          const outputSide: ProxyItem[] = [];

          for (const proxyIdRaw of proxyIds) {
            const proxyId = String(proxyIdRaw ?? '');
            if (!proxyId) continue;
            const proxyNode = nodeById.get(proxyId);
            if (!proxyNode) continue;

            const direction =
              String((proxyNode as AnyRecord)?.config?.direction ?? 'output') === 'input' ? 'input' : 'output';
            const pinned = Boolean((proxyNode as AnyRecord)?.config?.pinned);

            const cur = adapter.getNodePosition(proxyId);
            const curCenterY = cur ? cur.y + PROXY_NODE_HALF_HEIGHT : centerY;

            let desiredCenterY = centerY;
            if (pinned) {
              desiredCenterY = curCenterY;
            } else if (direction === 'input') {
              // Left edge proxy forwards to inside via `out` → (target inside group).
              const internal = connections.filter(
                (c: AnyRecord) => String(c.sourceNodeId) === proxyId && String(c.sourcePortId) === 'out'
              );
              if (internal.length > 0) {
                const ys = internal.map((c: AnyRecord) => nodeCenterY(String(c.targetNodeId)));
                desiredCenterY = ys.reduce((sum: number, y: number) => sum + y, 0) / ys.length;
              } else {
                desiredCenterY = curCenterY;
              }
            } else {
              // Right edge proxy forwards from inside via (source inside group) → `in`.
              const internal = connections.find(
                (c: AnyRecord) => String(c.targetNodeId) === proxyId && String(c.targetPortId) === 'in'
              );
              if (internal) desiredCenterY = nodeCenterY(String((internal as AnyRecord).sourceNodeId));
              else desiredCenterY = curCenterY;
            }

            const item: ProxyItem = {
              id: proxyId,
              direction,
              pinned,
              desiredCenterY: clampCenterY(desiredCenterY),
            };
            if (direction === 'input') inputSide.push(item);
            else outputSide.push(item);
          }

          const distribute = (items: ProxyItem[]) => {
            if (items.length === 0) return;
            if (items.length === 1) return;

            const available = maxCenterY - minCenterY;
            const maxSpacing = items.length > 1 ? available / (items.length - 1) : PROXY_MIN_SPACING;
            const spacing = Math.max(14, Math.min(PROXY_MIN_SPACING, maxSpacing));

            items.sort((a, b) => a.desiredCenterY - b.desiredCenterY || a.id.localeCompare(b.id));
            const ys = items.map((i) => clampCenterY(i.desiredCenterY));

            for (let i = 1; i < ys.length; i += 1) {
              ys[i] = Math.max(ys[i], ys[i - 1] + spacing);
            }

            const overflow = ys[ys.length - 1] - maxCenterY;
            if (overflow > 0) {
              for (let i = 0; i < ys.length; i += 1) ys[i] -= overflow;
              for (let i = ys.length - 2; i >= 0; i -= 1) {
                ys[i] = Math.min(ys[i], ys[i + 1] - spacing);
              }
              const underflow = minCenterY - ys[0];
              if (underflow > 0) {
                for (let i = 0; i < ys.length; i += 1) ys[i] += underflow;
              }
            }

            for (let i = 0; i < items.length; i += 1) {
              items[i].desiredCenterY = clampCenterY(ys[i]);
            }
          };

          distribute(inputSide);
          distribute(outputSide);

          for (const item of [...inputSide, ...outputSide]) {
            const right = frame.left + frame.width;

            const desiredX = isMinimized
              ? item.direction === 'input'
                ? frame.left - PROXY_SOCKET_OUTSET
                : right + PROXY_SOCKET_OUTSET - PROXY_NODE_WIDTH
              : // Straddle the frame edge so one socket is inside and one is outside the Group boundary.
                item.direction === 'input'
                ? frame.left - PROXY_NODE_WIDTH / 2 - PROXY_EDGE_NUDGE
                : right - PROXY_NODE_WIDTH / 2 + PROXY_EDGE_NUDGE;
            const topLeftY = item.desiredCenterY - PROXY_NODE_HALF_HEIGHT;
            const cur = adapter.getNodePosition(item.id);
            if (!cur || Math.abs(cur.x - desiredX) > 1 || Math.abs(cur.y - topLeftY) > 1) {
              adapter.setNodePosition(item.id, desiredX, topLeftY);
            }
          }
        }
      }
    } finally {
      groupController.endProgrammaticTranslate();
    }
  };

  const scheduleAlign = () => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (alignRaf) return;
    alignRaf = requestAnimationFrame(() => {
      alignRaf = 0;
      alignGroupPortNodes();
    });
  };

  const normalizeGroupProxyConnections = () => {
    if (isNormalizing) return;
    const groups = get(groupController.nodeGroups);
    if (groups.length === 0) return;

    isNormalizing = true;
    try {
      const state = nodeEngine.exportGraph() as GraphState;
      const nodes = Array.isArray(state.nodes) ? state.nodes : [];
      const connections = Array.isArray(state.connections) ? state.connections : [];

      const nodeById = new Map(nodes.map((n: AnyRecord) => [String(n.id), n] as const));

      const groupById = new Map<string, { id: string; parentId: string | null; nodeSet: Set<string> }>();
      const childrenByParentId = new Map<string, string[]>();
      for (const g of groups) {
        const id = String((g as AnyRecord).id ?? '');
        if (!id) continue;
        const parentId = (g as AnyRecord).parentId ? String((g as AnyRecord).parentId) : null;
        const nodeIds = Array.isArray((g as AnyRecord).nodeIds) ? (g as AnyRecord).nodeIds.map(String).filter(Boolean) : [];
        groupById.set(id, { id, parentId, nodeSet: new Set(nodeIds) });
        if (!parentId) continue;
        const list = childrenByParentId.get(parentId) ?? [];
        list.push(id);
        childrenByParentId.set(parentId, list);
      }

      const depthCache = new Map<string, number>();
      const getDepth = (groupId: string, visiting = new Set<string>()): number => {
        const cached = depthCache.get(groupId);
        if (cached !== undefined) return cached;
        if (visiting.has(groupId)) return 0;
        visiting.add(groupId);
        const group = groupById.get(groupId);
        const parentId = group?.parentId && groupById.has(String(group.parentId)) ? String(group.parentId) : null;
        const depth = parentId ? getDepth(parentId, visiting) + 1 : 0;
        visiting.delete(groupId);
        depthCache.set(groupId, depth);
        return depth;
      };

      const pathCache = new Map<string, string[]>();
      const getPath = (groupId: string, visiting = new Set<string>()): string[] => {
        const cached = pathCache.get(groupId);
        if (cached) return cached;
        if (visiting.has(groupId)) return [];
        visiting.add(groupId);
        const group = groupById.get(groupId);
        const parentId = group?.parentId && groupById.has(String(group.parentId)) ? String(group.parentId) : null;
        const next = parentId ? [...getPath(parentId, visiting), groupId] : [groupId];
        visiting.delete(groupId);
        pathCache.set(groupId, next);
        return next;
      };

      const primaryGroupIdForNode = (nodeId: string): string | null => {
        const id = String(nodeId ?? '');
        if (!id) return null;
        let bestId: string | null = null;
        let bestDepth = -1;
        let bestSize = Number.POSITIVE_INFINITY;

        for (const g of groupById.values()) {
          if (!g.nodeSet.has(id)) continue;
          const depth = getDepth(g.id);
          const size = g.nodeSet.size;
          if (depth > bestDepth || (depth === bestDepth && size < bestSize)) {
            bestId = g.id;
            bestDepth = depth;
            bestSize = size;
          }
        }

        return bestId;
      };

      const arraysEqual = (a: readonly string[], b: readonly string[]) =>
        a.length === b.length && a.every((v, i) => v === b[i]);

      const commonPrefixLen = (a: readonly string[], b: readonly string[]) => {
        const len = Math.min(a.length, b.length);
        let i = 0;
        for (; i < len; i += 1) if (a[i] !== b[i]) break;
        return i;
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

      const resolveProxyPortType = (node: AnyRecord): string => {
        const raw = node?.config?.portType;
        const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
        return validPortTypes.has(t) ? t : 'any';
      };

      const portTypeFor = (nodeId: string, side: 'input' | 'output', portId: string): string => {
        const node = nodeById.get(String(nodeId));
        if (!node) return 'any';
        if (String(node.type) === GROUP_PROXY_NODE_TYPE) return resolveProxyPortType(node);
        const def = nodeRegistry.get(String(node.type ?? ''));
        const ports = side === 'input' ? def?.inputs : def?.outputs;
        const port = (ports ?? []).find((p: AnyRecord) => String(p.id) === String(portId));
        const t = String((port as AnyRecord)?.type ?? 'any');
        return validPortTypes.has(t) ? t : 'any';
      };

      const wireTypeFor = (conn: AnyRecord): string => {
        const sourceType = portTypeFor(String(conn.sourceNodeId), 'output', String(conn.sourcePortId));
        const targetType = portTypeFor(String(conn.targetNodeId), 'input', String(conn.targetPortId));
        if (sourceType !== 'any') return sourceType;
        if (targetType !== 'any') return targetType;
        return 'any';
      };

      const portContext = (nodeId: string, side: 'input' | 'output', portId: string): string[] => {
        const node = nodeById.get(String(nodeId));
        if (!node) return [];
        const type = String(node.type ?? '');

        if (type === GROUP_GATE_NODE_TYPE) {
          const gid = groupIdFromNode(node);
          if (!gid) return [];
          const path = getPath(gid);
          return path.slice(0, Math.max(0, path.length - 1));
        }

        if (type === GROUP_PROXY_NODE_TYPE) {
          const gid = groupIdFromNode(node);
          const path = gid ? getPath(gid) : [];
          const parentPath = path.slice(0, Math.max(0, path.length - 1));
          const direction = String((node.config as AnyRecord)?.direction ?? 'output');
          if (direction === 'input') {
            if (side === 'input' && portId === 'in') return parentPath;
            return path;
          }
          // output
          if (side === 'output' && portId === 'out') return parentPath;
          return path;
        }

        const primary = primaryGroupIdForNode(String(nodeId));
        return primary ? getPath(primary) : [];
      };

      const frameByGroupId = new Map<string, AnyRecord>();
      for (const frame of get(groupController.groupFrames) ?? []) {
        const gid = String(frame?.group?.id ?? '');
        if (gid) frameByGroupId.set(gid, frame);
      }

      const PROXY_NODE_WIDTH = 48;
      const PROXY_NODE_HALF_HEIGHT = 10;
      const PROXY_SOCKET_OUTSET = 10;
      const PROXY_EDGE_NUDGE = 12;

      const proxyPosition = (groupId: string, direction: 'input' | 'output', hintNodeId?: string | null) => {
        const frame = frameByGroupId.get(String(groupId)) ?? null;
        const baseX = frame ? frame.left : 120 + getNodeCount() * 10;
        const baseY = frame ? frame.top + frame.height / 2 : 120 + getNodeCount() * 6;
        const x = frame
          ? (() => {
              const isMinimized = Boolean((frame as AnyRecord)?.group?.minimized);
              if (isMinimized) {
                const right = frame.left + frame.width;
                return direction === 'input'
                  ? frame.left - PROXY_SOCKET_OUTSET
                  : right + PROXY_SOCKET_OUTSET - PROXY_NODE_WIDTH;
              }
              return direction === 'input'
                ? frame.left - PROXY_NODE_WIDTH / 2 - PROXY_EDGE_NUDGE
                : frame.left + frame.width - PROXY_NODE_WIDTH / 2 + PROXY_EDGE_NUDGE;
            })()
          : direction === 'input'
            ? baseX - 60
            : baseX + 60;

        let y = baseY;
        if (hintNodeId) {
          const b = adapter.getNodeBounds(String(hintNodeId));
          if (b) y = (b.top + b.bottom) / 2;
          else {
            const pos = adapter.getNodePosition(String(hintNodeId));
            if (pos) y = pos.y;
          }
        }

        if (frame) {
          const isMinimized = Boolean((frame as AnyRecord)?.group?.minimized);
          const minimizedHeaderHeight = 44;
          const minimizedRowHeight = 28;
          const minimizedPad = 6;

          const topPad = isMinimized
            ? minimizedHeaderHeight + minimizedPad + minimizedRowHeight / 2
            : (() => {
                const h = Number(frame.height ?? 0);
                if (!Number.isFinite(h) || h <= 0) return 56;
                return Math.max(24, Math.min(56, Math.max(0, h / 2 - 18)));
              })();
          const bottomPad = isMinimized ? minimizedPad + minimizedRowHeight / 2 : topPad;
          const top = frame.top + topPad;
          const bottom = frame.top + frame.height - bottomPad;
          if (bottom > top) y = Math.max(top, Math.min(bottom, y));
        }

        return { x, y: y - PROXY_NODE_HALF_HEIGHT };
      };

      const addProxyNode = (groupId: string, direction: 'input' | 'output', portType: string) => {
        const pos = proxyPosition(groupId, direction);
        return addNode(GROUP_PROXY_NODE_TYPE, pos, { groupId, direction, portType, pinned: false });
      };

      const toRewrite: AnyRecord[] = [];
      for (const conn of connections) {
        const connId = String(conn.id ?? '');
        if (!connId) continue;

        const sourceNode = nodeById.get(String(conn.sourceNodeId));
        const targetNode = nodeById.get(String(conn.targetNodeId));
        if (!sourceNode || !targetNode) continue;

        const sourceCtx = portContext(String(conn.sourceNodeId), 'output', String(conn.sourcePortId));
        const targetCtx = portContext(String(conn.targetNodeId), 'input', String(conn.targetPortId));

        // Safety: the Group Gate input must never be driven from inside its own group subtree (including child groups).
        if (String(targetNode.type) === GROUP_GATE_NODE_TYPE && String(conn.targetPortId) === 'active') {
          const gid = groupIdFromNode(targetNode);
          if (gid && sourceCtx.includes(String(gid))) {
            nodeEngine.removeConnection(connId);
            nodeEngine.lastError?.set?.('Group gate input cannot originate from inside the group.');
            continue;
          }
        }

        if (arraysEqual(sourceCtx, targetCtx)) continue;

        toRewrite.push({
          conn,
          sourceCtx,
          targetCtx,
          wireType: wireTypeFor(conn),
        });
      }

      if (toRewrite.length > 0) {
        for (const entry of toRewrite) {
          const conn = entry.conn;
          const connId = String(conn.id ?? '');
          if (!connId) continue;
          const sourceNodeId = String(conn.sourceNodeId ?? '');
          const sourcePortId = String(conn.sourcePortId ?? '');
          const targetNodeId = String(conn.targetNodeId ?? '');
          const targetPortId = String(conn.targetPortId ?? '');
          if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) continue;

          nodeEngine.removeConnection(connId);

          const sourceCtx: string[] = entry.sourceCtx ?? [];
          const targetCtx: string[] = entry.targetCtx ?? [];
          const wireType: string = validPortTypes.has(entry.wireType) ? entry.wireType : 'any';

          const prefixLen = commonPrefixLen(sourceCtx, targetCtx);

          let currentNodeId = sourceNodeId;
          let currentPortId = sourcePortId;

          for (let i = sourceCtx.length - 1; i >= prefixLen; i -= 1) {
            const gid = String(sourceCtx[i] ?? '');
            if (!gid) continue;
            const proxyId = addProxyNode(gid, 'output', wireType);
            if (!proxyId) continue;
            addConnection(currentNodeId, currentPortId, proxyId, 'in');
            currentNodeId = proxyId;
            currentPortId = 'out';
          }

          for (let i = prefixLen; i < targetCtx.length; i += 1) {
            const gid = String(targetCtx[i] ?? '');
            if (!gid) continue;
            const proxyId = addProxyNode(gid, 'input', wireType);
            if (!proxyId) continue;
            addConnection(currentNodeId, currentPortId, proxyId, 'in');
            currentNodeId = proxyId;
            currentPortId = 'out';
          }

          addConnection(currentNodeId, currentPortId, targetNodeId, targetPortId);
        }
      }

      // Clean up proxies when they no longer represent a boundary crossing:
      // - Require both internal + external wires, even for pinned proxies.
      const nextState = nodeEngine.exportGraph();
      const nextNodes = Array.isArray(nextState.nodes) ? nextState.nodes : [];
      const nextConnections = Array.isArray(nextState.connections) ? nextState.connections : [];
      const nextNodeById = new Map(nextNodes.map((n: AnyRecord) => [String(n.id), n] as const));
      for (const node of nextNodes) {
        const id = String((node as AnyRecord)?.id ?? '');
        if (!id || nodeById.has(id)) continue;
        nodeById.set(id, node);
      }

      const resolvePortTypeFromNodePort = (nodeId: string, side: 'input' | 'output', portId: string): string => {
        const instance = nodeEngine.getNode(String(nodeId)) as AnyRecord;
        if (!instance) return 'any';
        if (String(instance.type) === GROUP_PROXY_NODE_TYPE) {
          const raw = (instance.config as AnyRecord)?.portType;
          const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
          return validPortTypes.has(t) ? t : 'any';
        }
        const def = nodeRegistry.get(String(instance.type ?? ''));
        const ports = side === 'input' ? def?.inputs : def?.outputs;
        const port = (ports ?? []).find((p: AnyRecord) => String(p.id) === String(portId)) ?? null;
        const t = String((port as AnyRecord)?.type ?? 'any');
        return validPortTypes.has(t) ? t : 'any';
      };

      const nodePathForCleanup = (nodeId: string): string[] => {
        const node = nextNodeById.get(String(nodeId));
        if (!node) return [];
        const type = String(node.type ?? '');
        if (isGroupPortNodeType(type)) {
          const gid = groupIdFromNode(node as AnyRecord);
          return gid ? getPath(gid) : [];
        }
        const primary = primaryGroupIdForNode(String(nodeId));
        return primary ? getPath(primary) : [];
      };

      let removedProxy = false;
      for (const node of nextNodes) {
        if (String(node.type) !== GROUP_PROXY_NODE_TYPE) continue;
        const id = String(node.id ?? '');
        if (!id) continue;
        const pinned = Boolean((node as AnyRecord)?.config?.pinned);
        const directionRaw = String((node as AnyRecord)?.config?.direction ?? 'output');
        let direction: 'input' | 'output' = directionRaw === 'input' ? 'input' : 'output';

        const groupId = groupIdFromNode(node as AnyRecord);
        const group = groupById.get(groupId);
        const nodeSet = group?.nodeSet ?? null;
        const groupIdKey = String(groupId ?? '');
        const isInsideGroup = (nodeId: string) =>
          groupIdKey ? nodePathForCleanup(String(nodeId)).includes(groupIdKey) : false;

        // Robust internal/external detection: infer direction from actual wiring and group membership,
        // so stale configs can't leave orphaned proxy dots behind.
        let internalToProxyIn: AnyRecord | null = null;
        let internalFromProxyOut: AnyRecord[] = [];

        for (const c of nextConnections) {
          const sourceNodeId = String((c as AnyRecord).sourceNodeId ?? '');
          const sourcePortId = String((c as AnyRecord).sourcePortId ?? '');
          const targetNodeId = String((c as AnyRecord).targetNodeId ?? '');
          const targetPortId = String((c as AnyRecord).targetPortId ?? '');

          if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) continue;

          if (targetNodeId === id && targetPortId === 'in') {
            const inside = isInsideGroup(sourceNodeId);
            if (inside) internalToProxyIn = c;
          }

          if (sourceNodeId === id && sourcePortId === 'out') {
            const inside = isInsideGroup(targetNodeId);
            if (inside) internalFromProxyOut.push(c);
          }
        }

        const internalConnected = Boolean(internalToProxyIn) || internalFromProxyOut.length > 0;

        const inferredDirection =
          internalFromProxyOut.length > 0 && !internalToProxyIn
            ? 'input'
            : internalToProxyIn && internalFromProxyOut.length === 0
              ? 'output'
              : null;
        if (inferredDirection && inferredDirection !== direction) {
          direction = inferredDirection;
          nodeEngine.updateNodeConfig(id, { direction });
        }

        // Keep proxy socket color/type aligned to the internal port it proxies.
        const inferredPortType = (() => {
          if (!nodeSet) return null;
          if (direction === 'input') {
            for (const c of internalFromProxyOut) {
              const t = resolvePortTypeFromNodePort(String((c as AnyRecord).targetNodeId), 'input', String((c as AnyRecord).targetPortId));
              if (t !== 'any') return t;
            }
            return internalFromProxyOut.length > 0
              ? resolvePortTypeFromNodePort(
                  String((internalFromProxyOut[0] as AnyRecord).targetNodeId),
                  'input',
                  String((internalFromProxyOut[0] as AnyRecord).targetPortId)
                )
              : null;
          }
          if (internalToProxyIn) {
            return resolvePortTypeFromNodePort(
              String((internalToProxyIn as AnyRecord).sourceNodeId),
              'output',
              String((internalToProxyIn as AnyRecord).sourcePortId)
            );
          }
          return null;
        })();

        if (inferredPortType) {
          const current = resolveProxyPortType(node);
          if (current !== inferredPortType) {
            nodeEngine.updateNodeConfig(id, { portType: inferredPortType });
          }
        }

        // If the internal wire is disconnected, the proxy no longer represents a boundary crossing.
        if (!internalConnected) {
          nodeEngine.removeNode(id);
          removedProxy = true;
          continue;
        }

        if (pinned) continue;
      }

      scheduleAlign();
      if (removedProxy) {
        // Removing a proxy can orphan its neighbor proxy; run another pass to clean up.
        scheduleNormalizeProxies();
      }
    } finally {
      isNormalizing = false;
    }
  };

  const scheduleNormalizeProxies = () => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (normalizeRaf) return;
    normalizeRaf = requestAnimationFrame(() => {
      normalizeRaf = 0;
      normalizeGroupProxyConnections();
    });
  };

  const updateRuntimeActives = () => {
    const groups = get(groupController.nodeGroups);
    if (groups.length === 0) return;

    const state = nodeEngine.exportGraph();
    const activeByGroupId = new Map<string, boolean>();

    for (const node of state.nodes ?? []) {
      if (String(node.type) !== GROUP_GATE_NODE_TYPE) continue;
      const groupId = groupIdFromNode(node);
      if (!groupId) continue;
      const raw = (node.outputValues as AnyRecord)?.active;
      activeByGroupId.set(groupId, typeof raw === 'boolean' ? raw : true);
    }

    groupController.setRuntimeActiveByGroupId(activeByGroupId);
  };

  const removeGroupPortNodesForGroupIds = (groupIds: string[]): number => {
    const ids = new Set((groupIds ?? []).map((id) => String(id)).filter(Boolean));
    if (ids.size === 0) return 0;

    let removed = 0;
    const state = nodeEngine.exportGraph();
    for (const node of state.nodes ?? []) {
      const type = String(node.type ?? '');
      if (!isGroupDecorationNodeType(type)) continue;
      const groupId = groupIdFromNode(node);
      if (!groupId || !ids.has(groupId)) continue;
      nodeEngine.removeNode(String(node.id));
      removed += 1;
    }

    return removed;
  };

  const disassembleGroupAndPorts = (groupId: string) => {
    const rootId = String(groupId ?? '');
    if (!rootId) return;

    const groupsSnapshot = get(groupController.nodeGroups);
    const toRemove = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || toRemove.has(id)) continue;
      toRemove.add(id);
      for (const g of groupsSnapshot) {
        if (String(g.parentId ?? '') === id) stack.push(String(g.id));
      }
    }

    groupController.disassembleGroup(rootId);
    removeGroupPortNodesForGroupIds(Array.from(toRemove));
  };

  const destroy = () => {
    if (alignRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(alignRaf);
    alignRaf = 0;
    if (normalizeRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(normalizeRaf);
    normalizeRaf = 0;
    isNormalizing = false;
  };

  return {
    ensureGroupPortNodes,
    scheduleAlign,
    scheduleNormalizeProxies,
    updateRuntimeActives,
    removeGroupPortNodesForGroupIds,
    disassembleGroupAndPorts,
    destroy,
  };
}
