// Purpose: Persist Manager-only Node Graph layout positions without syncing them to server semantic state.
import type { GraphState } from '$lib/nodes/types';

export const NODE_GRAPH_LAYOUT_STORAGE_KEY = 'shugu-node-graph-layout-v1';

export type NodeGraphLayoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type NodeGraphLayoutPosition = { x: number; y: number };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readStorage(storage?: NodeGraphLayoutStorage | null): NodeGraphLayoutStorage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function graphLayoutPositionsFromGraph(
  graph: Pick<GraphState, 'nodes'> | null | undefined
): Map<string, NodeGraphLayoutPosition> {
  const positions = new Map<string, NodeGraphLayoutPosition>();
  for (const node of graph?.nodes ?? []) {
    const id = String(node.id ?? '');
    const x = Number(node.position?.x);
    const y = Number(node.position?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    positions.set(id, { x, y });
  }
  return positions;
}

export function readNodeGraphLayoutPositions(
  storage?: NodeGraphLayoutStorage | null
): Map<string, NodeGraphLayoutPosition> {
  const target = readStorage(storage);
  const positions = new Map<string, NodeGraphLayoutPosition>();
  if (!target) return positions;

  try {
    const raw = target.getItem(NODE_GRAPH_LAYOUT_STORAGE_KEY);
    if (!raw) return positions;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return positions;
    const record = parsed as Record<string, unknown>;
    for (const [id, value] of Object.entries(record)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const position = value as Record<string, unknown>;
      if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) continue;
      positions.set(id, { x: position.x, y: position.y });
    }
  } catch {
    return new Map();
  }
  return positions;
}

export function writeNodeGraphLayoutPositions(
  positions: Map<string, NodeGraphLayoutPosition>,
  storage?: NodeGraphLayoutStorage | null
): void {
  const target = readStorage(storage);
  if (!target) return;
  const record: Record<string, NodeGraphLayoutPosition> = {};
  for (const [id, position] of positions) {
    if (!id) continue;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    record[id] = { x: position.x, y: position.y };
  }
  try {
    target.setItem(NODE_GRAPH_LAYOUT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage failures
  }
}

export function saveNodeGraphLayoutFromGraph(
  graph: Pick<GraphState, 'nodes'> | null | undefined,
  storage?: NodeGraphLayoutStorage | null
): void {
  writeNodeGraphLayoutPositions(graphLayoutPositionsFromGraph(graph), storage);
}

export function patchNodeGraphLayoutPosition(
  nodeId: string,
  position: NodeGraphLayoutPosition,
  storage?: NodeGraphLayoutStorage | null
): void {
  const id = String(nodeId ?? '');
  if (!id || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  const positions = readNodeGraphLayoutPositions(storage);
  positions.set(id, { x: position.x, y: position.y });
  writeNodeGraphLayoutPositions(positions, storage);
}

export function clearNodeGraphLayout(storage?: NodeGraphLayoutStorage | null): void {
  const target = readStorage(storage);
  if (!target) return;
  try {
    target.removeItem(NODE_GRAPH_LAYOUT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}
