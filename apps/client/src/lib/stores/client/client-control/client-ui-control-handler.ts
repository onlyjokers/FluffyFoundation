// Purpose: Execute ClientUI control commands by updating the local ClientUI runtime store.
import type { ClientUiPayload } from '@shugu/protocol';
import { clientUiRuntime } from '../client-ui-runtime';

export function executeClientUiControl(action: string, payload: unknown): boolean {
  if (action !== 'clientUi') return false;
  clientUiRuntime.applyPayload(payload as ClientUiPayload);
  return true;
}
