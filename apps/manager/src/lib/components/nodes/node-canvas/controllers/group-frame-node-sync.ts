/**
 * Purpose: Keep minimized Group frame UI nodes in sync with Group controller state.
 */
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { computeGroupNodeBounds } from './group-port-legacy-migration';
import { groupIdFromNode, GROUP_PROXY_NODE_TYPE } from '../utils/group-port-utils';

export const GROUP_FRAME_NODE_TYPE = 'group-frame';

type AnyRecord = Record<string, unknown>;

export type GroupFrameNodeSyncGroup = {
  id: string;
  name?: string;
  disabled?: boolean;
  minimized?: boolean;
};

export type GroupFrameNodeSyncEngine = {
  removeNode: (nodeId: string) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
};

export type GroupFrameNodeSyncOptions = {
  groups: GroupFrameNodeSyncGroup[];
  state: GraphState;
  nodeEngine: GroupFrameNodeSyncEngine;
  getNodeCount: () => number;
  addNode: (type: string, position: { x: number; y: number }, configPatch?: Record<string, unknown> | null) => string;
};

export function syncGroupFrameNodes(options: GroupFrameNodeSyncOptions): void {
  const { groups, state, nodeEngine, getNodeCount, addNode } = options;
  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  const nodeById = new Map(nodes.map((n: AnyRecord) => [String(n?.id ?? ''), n] as const));
  const existingFrameNodeIdByGroupId = new Map<string, string>();

  for (const node of nodes) {
    if (String((node as AnyRecord).type ?? '') !== GROUP_FRAME_NODE_TYPE) continue;
    const groupId = groupIdFromNode(node as NodeInstance);
    const id = String((node as AnyRecord).id ?? '');
    if (!groupId || !id) continue;
    if (!existingFrameNodeIdByGroupId.has(groupId)) existingFrameNodeIdByGroupId.set(groupId, id);
    else nodeEngine.removeNode(id);
  }

  const groupIdSet = new Set(groups.map((g) => String(g.id ?? '')).filter(Boolean));
  for (const [groupId, nodeId] of existingFrameNodeIdByGroupId.entries()) {
    if (groupId && nodeId && !groupIdSet.has(groupId)) nodeEngine.removeNode(nodeId);
  }

  for (const group of groups) {
    const groupId = String(group.id ?? '');
    if (!groupId) continue;
    const existingFrameNodeId = existingFrameNodeIdByGroupId.get(groupId) ?? '';

    if (!group.minimized) {
      if (existingFrameNodeId) nodeEngine.removeNode(existingFrameNodeId);
      continue;
    }

    if (existingFrameNodeId) {
      updateExistingFrameNode(group, existingFrameNodeId, nodeById.get(existingFrameNodeId), nodeEngine);
      continue;
    }

    addMinimizedFrameNode(group, state, nodes, getNodeCount, addNode);
  }
}

function updateExistingFrameNode(
  group: GroupFrameNodeSyncGroup,
  existingFrameNodeId: string,
  frameNode: AnyRecord | undefined,
  nodeEngine: GroupFrameNodeSyncEngine
): void {
  const desiredName = String(group.name ?? 'Group');
  const desiredDisabled = Boolean(group.disabled);
  const currentName = String((frameNode?.config as AnyRecord)?.name ?? '');
  const currentDisabled = Boolean((frameNode?.config as AnyRecord)?.disabled);
  const patch: Record<string, unknown> = {};

  if (desiredName && desiredName !== currentName) patch.name = desiredName;
  if (desiredDisabled !== currentDisabled) patch.disabled = desiredDisabled;
  if (Object.keys(patch).length > 0) nodeEngine.updateNodeConfig(existingFrameNodeId, patch);
}

function addMinimizedFrameNode(
  group: GroupFrameNodeSyncGroup,
  state: GraphState,
  nodes: NodeInstance[],
  getNodeCount: () => number,
  addNode: GroupFrameNodeSyncOptions['addNode']
): void {
  const bounds = computeGroupNodeBounds(group as AnyRecord, state);
  const count = getNodeCount();
  const centerX = bounds ? bounds.centerX : 120 + count * 10;
  const centerY = bounds ? bounds.centerY : 120 + count * 6;
  const proxyNodes = nodes.filter(
    (node) => node.type === GROUP_PROXY_NODE_TYPE && String((node.config as AnyRecord)?.groupId ?? '') === group.id
  );
  const inputProxyCount = proxyNodes.filter(
    (node) => String((node.config as AnyRecord)?.direction ?? 'output') === 'input'
  ).length;
  const outputProxyCount = Math.max(0, proxyNodes.length - inputProxyCount);
  const portRows = Math.max(1, Math.max(inputProxyCount, outputProxyCount));
  const width = 230;
  const height = Math.max(84, 44 + portRows * 28 + 12);

  addNode(
    GROUP_FRAME_NODE_TYPE,
    { x: centerX - width / 2, y: centerY - height / 2 },
    {
      groupId: group.id,
      name: String(group.name ?? 'Group'),
      disabled: Boolean(group.disabled),
    }
  );
}
