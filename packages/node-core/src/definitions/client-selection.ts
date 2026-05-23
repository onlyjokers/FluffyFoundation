/**
 * Purpose: Stable client selection helpers for client-loader nodes.
 */
import { clampInt, coerceBoolean, hashStringDjb2 } from './utils.js';

type ClientSelectionState = {
  availableKey: string;
  random: boolean;
  stableRandomOrder: string[];
};

const clientSelectionStateByNodeId = new Map<string, ClientSelectionState>();

function buildStableRandomOrder(nodeId: string, clients: string[]): string[] {
  const keyed = clients.map((id) => ({ id, score: hashStringDjb2(`${nodeId}|${id}`) }));
  keyed.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return keyed.map((k) => k.id);
}

export function selectClientIdsForNode(
  nodeId: string,
  clients: string[],
  options: { index: unknown; range: unknown; random: unknown }
): { index: number; selectedIds: string[] } {
  const total = clients.length;
  if (total === 0) return { index: 1, selectedIds: [] };

  const index = clampInt(options.index, 1, 1, total);
  const range = clampInt(options.range, 1, 1, total);
  const random = coerceBoolean(options.random);

  const availableKey = clients.join('|');
  const prev = clientSelectionStateByNodeId.get(nodeId);
  const needRebuild =
    !prev ||
    prev.availableKey !== availableKey ||
    prev.random !== random ||
    prev.stableRandomOrder.length !== total;

  const state: ClientSelectionState = needRebuild
    ? {
        availableKey,
        random,
        stableRandomOrder: random ? buildStableRandomOrder(nodeId, clients) : clients.slice(),
      }
    : prev;

  if (needRebuild) clientSelectionStateByNodeId.set(nodeId, state);

  const ordered = state.random ? state.stableRandomOrder : clients;
  const start = index - 1;
  const selected: string[] = [];
  for (let i = 0; i < range; i += 1) {
    selected.push(ordered[(start + i) % total]);
  }
  return { index, selectedIds: selected };
}
