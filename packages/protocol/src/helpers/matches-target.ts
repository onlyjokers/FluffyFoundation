/**
 * Purpose: Target selector matching for protocol control messages.
 */
import type { TargetSelector } from '../types.js';

export function matchesTarget(clientId: string, target: TargetSelector, clientGroup?: string): boolean {
  switch (target.mode) {
    case 'all':
      return true;
    case 'clientIds':
      return target.ids.includes(clientId);
    case 'group':
      return clientGroup === target.groupId;
    default:
      return false;
  }
}
