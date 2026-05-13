/**
 * Purpose: Record client control events for browser e2e assertions in development mode.
 */
import type { ControlAction, ControlPayload } from '@shugu/protocol';
import type { WindowE2E } from './types';

export function recordE2ECommand(action: ControlAction, payload: ControlPayload, executeAt?: number): void {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !(window as WindowE2E).__SHUGU_E2E) return;

  const entry = { at: Date.now(), action, payload, executeAt };
  const win = window as WindowE2E;
  win.__SHUGU_E2E_LAST_COMMAND = entry;
  const list = (win.__SHUGU_E2E_COMMANDS ??= []);
  list.push(entry);
  if (list.length > 200) list.splice(0, list.length - 200);
}
