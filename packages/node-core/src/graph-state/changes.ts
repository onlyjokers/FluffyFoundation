/**
 * Purpose: Pure graph change model + application helpers for Node Graph.
 */

import type { Connection, GraphState, NodeInstance } from '../types.js';

export type GraphChange =
  | { type: 'add-node'; node: NodeInstance }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'update-node-type'; nodeId: string; nodeType: string }
  | { type: 'update-node-position'; nodeId: string; position: { x: number; y: number } }
  | { type: 'update-node-config'; nodeId: string; config: Record<string, unknown> }
  | { type: 'add-connection'; connection: Connection }
  | { type: 'remove-connection'; connectionId: string };

export function applyGraphChanges(state: GraphState, changes: GraphChange[]): GraphState {
  let nodes = [...state.nodes];
  let connections = [...state.connections];

  for (const change of changes) {
    switch (change.type) {
      case 'add-node': {
        nodes = nodes.filter((node) => String(node.id) !== String(change.node.id));
        nodes = [...nodes, change.node];
        break;
      }
      case 'remove-node': {
        const nodeId = String(change.nodeId);
        nodes = nodes.filter((node) => String(node.id) !== nodeId);
        connections = connections.filter(
          (connection) =>
            String(connection.sourceNodeId) !== nodeId && String(connection.targetNodeId) !== nodeId
        );
        break;
      }
      case 'update-node-position': {
        nodes = nodes.map((node) =>
          String(node.id) === String(change.nodeId) ? { ...node, position: change.position } : node
        );
        break;
      }
      case 'update-node-type': {
        nodes = nodes.map((node) =>
          String(node.id) === String(change.nodeId) ? { ...node, type: change.nodeType } : node
        );
        break;
      }
      case 'update-node-config': {
        nodes = nodes.map((node) =>
          String(node.id) === String(change.nodeId) ? { ...node, config: change.config } : node
        );
        break;
      }
      case 'add-connection': {
        connections = connections.filter((connection) => String(connection.id) !== String(change.connection.id));
        connections = [...connections, change.connection];
        break;
      }
      case 'remove-connection': {
        const connectionId = String(change.connectionId);
        connections = connections.filter((connection) => String(connection.id) !== connectionId);
        break;
      }
      default: {
        const _exhaustive: never = change;
        return _exhaustive;
      }
    }
  }

  return { nodes, connections };
}
