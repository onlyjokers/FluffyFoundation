/**
 * Purpose: Derive structural graph changes for adapters without mutating runtime.
 */

import type { GraphChange, GraphState, NodeInstance } from './types';

const stableStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
};

const positionEqual = (a: NodeInstance['position'], b: NodeInstance['position']): boolean =>
  a?.x === b?.x && a?.y === b?.y;

export function diffGraphState(prev: GraphState, next: GraphState): GraphChange[] {
  const changes: GraphChange[] = [];
  const prevNodes = new Map(prev.nodes.map((node) => [String(node.id), node]));
  const nextNodes = new Map(next.nodes.map((node) => [String(node.id), node]));
  const prevConnections = new Map(prev.connections.map((conn) => [String(conn.id), conn]));
  const nextConnections = new Map(next.connections.map((conn) => [String(conn.id), conn]));

  for (const [id, node] of nextNodes) {
    if (!prevNodes.has(id)) {
      changes.push({ type: 'add-node', node });
      continue;
    }
    const prevNode = prevNodes.get(id)!;
    if (String(prevNode.type) !== String(node.type)) {
      changes.push({ type: 'update-node-type', nodeId: id, nodeType: String(node.type) });
    }
    if (!positionEqual(prevNode.position, node.position)) {
      changes.push({ type: 'update-node-position', nodeId: id, position: node.position });
    }
    if (stableStringify(prevNode.config) !== stableStringify(node.config)) {
      changes.push({ type: 'update-node-config', nodeId: id, config: node.config ?? {} });
    }
  }

  for (const [id] of prevNodes) {
    if (!nextNodes.has(id)) changes.push({ type: 'remove-node', nodeId: id });
  }

  for (const [id, connection] of nextConnections) {
    if (!prevConnections.has(id)) changes.push({ type: 'add-connection', connection });
  }

  for (const [id] of prevConnections) {
    if (!nextConnections.has(id)) changes.push({ type: 'remove-connection', connectionId: id });
  }

  return changes;
}
