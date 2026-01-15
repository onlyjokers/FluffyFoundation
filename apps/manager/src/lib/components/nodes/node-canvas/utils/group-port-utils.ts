/**
 * Purpose: Shared helpers for manager-only Group Port nodes (e.g. `group-activate`).
 */

import type { GraphState, NodeInstance } from '$lib/nodes/types';

export const LEGACY_GROUP_ACTIVATE_NODE_TYPE = 'group-activate';
export const GROUP_GATE_NODE_TYPE = 'group-gate';
export const GROUP_PROXY_NODE_TYPE = 'group-proxy';

export const isGroupPortNodeType = (type: string) =>
  type === LEGACY_GROUP_ACTIVATE_NODE_TYPE || type === GROUP_GATE_NODE_TYPE || type === GROUP_PROXY_NODE_TYPE;

export const isLegacyGroupActivateNodeType = (type: string) => type === LEGACY_GROUP_ACTIVATE_NODE_TYPE;

export const groupIdFromNode = (node: NodeInstance): string => {
  const config = node.config as Record<string, unknown> | undefined;
  const raw = config?.groupId;
  return typeof raw === 'string' ? raw : raw ? String(raw) : '';
};

export const buildGroupPortIndex = (state: GraphState) => {
  const byGroupId = new Map<
    string,
    { gateId?: string; legacyActivateIds: string[]; proxyIds: string[] }
  >();

  for (const node of state.nodes ?? []) {
    const type = String(node.type ?? '');
    if (!isGroupPortNodeType(type)) continue;
    const groupId = groupIdFromNode(node);
    if (!groupId) continue;

    const entry = byGroupId.get(groupId) ?? { legacyActivateIds: [], proxyIds: [] };
    if (type === GROUP_GATE_NODE_TYPE && !entry.gateId) entry.gateId = String(node.id);
    if (type === LEGACY_GROUP_ACTIVATE_NODE_TYPE) entry.legacyActivateIds.push(String(node.id));
    if (type === GROUP_PROXY_NODE_TYPE) entry.proxyIds.push(String(node.id));
    byGroupId.set(groupId, entry);
  }

  return byGroupId;
};
