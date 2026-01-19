import type { GraphChange, NodeExecutor } from '@shugu/sdk-client';

export function applyGraphChangesToExecutor(
  executor: NodeExecutor | null,
  changes: GraphChange[]
): void {
  if (!executor || changes.length === 0) return;
  executor.applyGraphChanges(changes);
}
