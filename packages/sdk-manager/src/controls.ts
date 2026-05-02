/**
 * Purpose: Shared helpers for ManagerSDK convenience control methods.
 */
import type { ControlAction, ControlPayload } from '@shugu/protocol';

export function sendControlByAudience(
  sendToAll: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void,
  sendToSelected: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void,
  toAll: boolean,
  action: ControlAction,
  payload: ControlPayload,
  executeAt?: number
): void {
  if (toAll) sendToAll(action, payload, executeAt);
  else sendToSelected(action, payload, executeAt);
}
