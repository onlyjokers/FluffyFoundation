// Purpose: Derive group gate UI state from the node graph without coupling it to NodeCanvas.
import { asRecord, getString } from '$lib/utils/value-guards';
import type { Connection, NodeInstance } from '$lib/nodes/types';

export function deriveGateModeGroupIds(
  nodes: NodeInstance[],
  connections: Connection[]
): Set<string> {
  const incomingTargetKeys = new Set<string>();
  for (const c of Array.isArray(connections) ? connections : []) {
    incomingTargetKeys.add(`${String(c.targetNodeId ?? '')}:${String(c.targetPortId ?? '')}`);
  }

  const result = new Set<string>();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (String(node.type ?? '') !== 'group-gate') continue;
    const nodeId = String(node.id ?? '');
    if (!nodeId) continue;
    if (!incomingTargetKeys.has(`${nodeId}:active`)) continue;
    const groupId = getString(asRecord(node.config).groupId, '');
    if (groupId) result.add(groupId);
  }

  return result;
}

export function deriveGroupGateNodeIdByGroupId(nodes: NodeInstance[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (String(node.type ?? '') !== 'group-gate') continue;
    const nodeId = String(node.id ?? '');
    if (!nodeId) continue;
    const groupId = getString(asRecord(node.config).groupId, '');
    if (!groupId) continue;
    if (!map.has(groupId)) map.set(groupId, nodeId);
  }

  return map;
}
