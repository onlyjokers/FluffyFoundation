/**
 * Purpose: Helpers for encoding/decoding Custom Node instance config.
 *
 * We keep Custom Node instance state in the node's `config` object so copy/paste,
 * undo/redo and project persistence naturally work like normal nodes.
 */
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { asRecord, getBoolean, getString } from '$lib/utils/value-guards';

export type CustomNodeRole = 'mother' | 'child';

export type CustomNodeInstanceState = {
  definitionId: string;
  /** Instance-level unique groupId (must be unique across the whole project). */
  groupId: string;
  role: CustomNodeRole;
  /** Manual gate toggle (part of: manualToggle AND wiredGateInput). */
  manualGate: boolean;
  /** Per-instance internal graph state (node ids are template ids; positions are relative to frame). */
  internal: GraphState;
};

const CONFIG_KEY = 'customNode';

export function readCustomNodeState(config: Record<string, unknown>): CustomNodeInstanceState | null {
  const raw = asRecord(config)[CONFIG_KEY];
  const rawRecord = asRecord(raw);

  const definitionId = getString(rawRecord.definitionId, '');
  const groupId = getString(rawRecord.groupId, '');
  const roleRaw = getString(rawRecord.role, '');
  const role = roleRaw === 'mother' ? 'mother' : roleRaw === 'child' ? 'child' : null;
  const manualGate = getBoolean(rawRecord.manualGate, true);
  const internalRaw = asRecord(rawRecord.internal);
  const internal =
    Array.isArray(internalRaw.nodes) && Array.isArray(internalRaw.connections)
      ? ({ nodes: internalRaw.nodes, connections: internalRaw.connections } as GraphState)
      : null;

  if (!definitionId || !groupId || !role || !internal) return null;
  return { definitionId, groupId, role, manualGate, internal };
}

export function writeCustomNodeState(
  config: Record<string, unknown>,
  state: CustomNodeInstanceState
): Record<string, unknown> {
  return {
    ...(config ?? {}),
    [CONFIG_KEY]: {
      definitionId: String(state.definitionId),
      groupId: String(state.groupId),
      role: state.role,
      manualGate: Boolean(state.manualGate),
      internal: state.internal,
    },
  };
}

export function isCustomNodeInstance(node: NodeInstance): boolean {
  return Boolean(readCustomNodeState(node.config ?? {}));
}

export function generateCustomNodeGroupId(): string {
  const token = crypto.randomUUID?.() ?? `${Date.now()}`;
  return `group:${token}`;
}

export function cloneInternalGraphForNewInstance(graph: GraphState, groupId?: string): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const targetGroupId = typeof groupId === 'string' && groupId ? String(groupId) : '';

  const clonedNodes = nodes.map((node) => {
    let config = { ...(node.config ?? {}) };
    const inputValues = { ...(node.inputValues ?? {}) };

    if (targetGroupId && (node.type === 'group-proxy' || node.type === 'group-gate')) {
      config = { ...config, groupId: targetGroupId };
    }

    const state = readCustomNodeState(config);
    if (!state) {
      return {
        ...node,
        config,
        inputValues,
        outputValues: {},
      };
    }

    const nestedGroupId = generateCustomNodeGroupId();
    const nextState: CustomNodeInstanceState = {
      ...state,
      // Nested mothers are always materialized as children for new instances.
      role: 'child',
      groupId: nestedGroupId,
      internal: cloneInternalGraphForNewInstance(state.internal, nestedGroupId),
    };

    return {
      ...node,
      config: writeCustomNodeState(config, nextState),
      inputValues,
      outputValues: {},
    };
  });

  return {
    nodes: clonedNodes,
    connections: connections.map((conn) => ({ ...conn })),
  };
}
