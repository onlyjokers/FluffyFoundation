/**
 * Purpose: Validate graph state integrity (ids + connection references).
 */

import type { GraphState } from '../types.js';

export type GraphValidationResult = { ok: boolean; errors: string[] };

export function validateGraphState(state: GraphState): GraphValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();

  for (const node of state.nodes) {
    const id = String(node.id);
    if (nodeIds.has(id)) errors.push(`duplicate node id: ${id}`);
    nodeIds.add(id);
  }

  for (const connection of state.connections) {
    const id = String(connection.id);
    if (connectionIds.has(id)) errors.push(`duplicate connection id: ${id}`);
    connectionIds.add(id);

    const source = String(connection.sourceNodeId);
    const target = String(connection.targetNodeId);
    if (!nodeIds.has(source)) errors.push(`missing source node: ${source}`);
    if (!nodeIds.has(target)) errors.push(`missing target node: ${target}`);
  }

  return { ok: errors.length === 0, errors };
}
