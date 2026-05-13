/**
 * Purpose: Selection-map option inference for manager node graphs.
 */
import type { GraphState } from './types';
import { getSelectOptionsForInput } from './selection-options';

export function applySelectionMapOptions(state: GraphState): GraphState {
  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  const connections = Array.isArray(state.connections) ? state.connections : [];
  const selectionNodes = new Set(
    nodes.filter((node) => node.type === 'midi-select-map').map((node) => String(node.id))
  );

  if (selectionNodes.size === 0 || connections.length === 0) return state;

  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const nextOptionsByNodeId = new Map<string, string[]>();

  for (const c of connections) {
    const sourceId = String(c.sourceNodeId);
    if (!selectionNodes.has(sourceId)) continue;
    const target = nodeById.get(String(c.targetNodeId));
    if (!target) continue;
    const options = getSelectOptionsForInput(target.type, String(c.targetPortId)) ?? [];
    nextOptionsByNodeId.set(sourceId, options);
  }

  if (nextOptionsByNodeId.size === 0) return state;

  const optionsEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, idx) => value === b[idx]);

  let changed = false;
  const nextNodes = nodes.map((node) => {
    const nextOptions = nextOptionsByNodeId.get(String(node.id));
    if (!nextOptions) return node;
    const configRecord =
      node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : null;
    const raw = Array.isArray(configRecord?.options) ? configRecord.options : [];
    const currentOptions = raw.map((value) => String(value)).filter((value) => value !== '');
    if (optionsEqual(currentOptions, nextOptions)) return node;
    changed = true;
    return {
      ...node,
      config: { ...(node.config ?? {}), options: nextOptions },
    };
  });

  return changed ? { ...state, nodes: nextNodes } : state;
}
