/**
 * Purpose: Pure routing helpers for patch runtime overrides and executor-log target selection.
 */

export type ExecutorStatusLike = { loopId?: unknown; running?: unknown };

export function resolveDeployedLoopClientId(
  statusMap: Map<string, ExecutorStatusLike>,
  loopId: string
): string {
  const id = String(loopId ?? '');
  if (!id) return '';
  for (const [cid, status] of statusMap.entries()) {
    if (String(status?.loopId ?? '') === id) return String(cid);
  }
  return '';
}

export function selectExecutorLogsTargetId(
  patchTargets: string[],
  selectedClientIds: string[],
  connectedClientIds: string[]
): string {
  return patchTargets[0] ?? selectedClientIds[0] ?? connectedClientIds[0] ?? '';
}
