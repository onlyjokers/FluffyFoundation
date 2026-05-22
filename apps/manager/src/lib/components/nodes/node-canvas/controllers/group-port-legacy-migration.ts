// Purpose: Migrate legacy Group Activate nodes to Group Gate nodes.
import { get } from 'svelte/store';
import type { GraphState, NodePort } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import type { NodeEngine } from '$lib/nodes/engine';
import type { GroupController } from './group-controller';
import { buildGroupPortIndex, GROUP_GATE_NODE_TYPE } from '../utils/group-port-utils';

type AnyRecord = Record<string, unknown>;
const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' ? (value as AnyRecord) : {};

type LegacyGroupActivateMigrationOptions = {
  nodeEngine: NodeEngine;
  nodeRegistry: NodeRegistry;
  groupController: GroupController;
  getNodeCount: () => number;
  addGroupPortNode: (
    type: string,
    groupId: string,
    position: { x: number; y: number }
  ) => string;
  addNode: (type: string, position: { x: number; y: number }) => string;
  addConnection: (
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ) => boolean;
};

export function migrateLegacyGroupActivateNodes(opts: LegacyGroupActivateMigrationOptions) {
  const groups = get(opts.groupController.nodeGroups);
  if (groups.length === 0) return;

  const state = opts.nodeEngine.exportGraph() as GraphState;
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

    const frame = get(opts.groupController.groupFrames).find((f) => String(f.group?.id ?? '') === groupId) ?? null;
    const hintX = frame ? frame.left : 120 + opts.getNodeCount() * 10;
    const hintY = frame ? frame.top : 120 + opts.getNodeCount() * 6;

    const gateId =
      ports.gateId ||
      opts.addGroupPortNode(GROUP_GATE_NODE_TYPE, groupId, { x: hintX - 140, y: hintY - 20 });
    if (!gateId) continue;

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

      const raw = asRecord(legacyNode.inputValues).active;
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

    for (const c of state.connections ?? []) {
      if (String(c.targetNodeId) === String(gateId) && String(c.targetPortId) === 'active') {
        opts.nodeEngine.removeConnection(String(c.id));
      }
    }

    if (wired.length > 0) {
      const coerceToBool = (source: { sourceNodeId: string; sourcePortId: string }) => {
        const sourceNode = nodeById.get(source.sourceNodeId);
        const sourceDef = sourceNode ? opts.nodeRegistry.get(String((sourceNode as AnyRecord).type ?? '')) : null;
        const portDef: NodePort | null =
          sourceDef?.outputs?.find((p) => String(p.id) === String(source.sourcePortId)) ?? null;
        const portType = String(portDef?.type ?? 'any');
        if (portType === 'boolean') return { nodeId: source.sourceNodeId, portId: source.sourcePortId };

        const convId = opts.addNode('logic-number-to-boolean', { x: hintX - 260, y: hintY - 20 });
        if (!convId) return { nodeId: source.sourceNodeId, portId: source.sourcePortId };
        opts.addConnection(source.sourceNodeId, source.sourcePortId, convId, 'number');
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
        const andId = opts.addNode('logic-and', { x: hintX - 200, y: hintY + i * 44 });
        if (!andId) continue;
        opts.addConnection(current.nodeId, current.portId, andId, 'a');
        opts.addConnection(next.nodeId, next.portId, andId, 'b');
        current = { nodeId: andId, portId: 'out' };
      }

      if (current) opts.addConnection(current.nodeId, current.portId, String(gateId), 'active');
    }

    for (const legacyId of legacyIds) opts.nodeEngine.removeNode(String(legacyId));
  }

  if (groupsChanged) opts.groupController.setGroups(nextGroups);
}

export function computeGroupNodeBounds(group: { nodeIds?: unknown }, state: GraphState) {
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
}
