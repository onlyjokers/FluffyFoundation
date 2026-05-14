/**
 * Purpose: Resolve manager node-runtime client IDs to server-accepted managed client group targets.
 */
import { targetGroup, type TargetSelector } from '@shugu/protocol';

export function targetManagedClient(clientId: string): TargetSelector | null {
  const id = String(clientId ?? '').trim();
  if (!id) return null;
  return targetGroup(`client:${id}`);
}
