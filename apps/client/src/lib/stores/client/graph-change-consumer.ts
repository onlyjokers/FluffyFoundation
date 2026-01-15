/**
 * Purpose: Apply graph change sets to the client node executor without full redeploys.
 */

import type { GraphChange } from '@shugu/node-core';
import type { NodeExecutor } from '@shugu/sdk-client';

export function applyGraphChangesToExecutor(
  executor: NodeExecutor | null,
  changes: GraphChange[]
): void {
  if (!executor || changes.length === 0) return;
  executor.applyGraphChanges(changes);
}
