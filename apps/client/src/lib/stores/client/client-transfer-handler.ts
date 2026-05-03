/**
 * Purpose: Apply incoming client-control-transfer status messages from the control executor.
 */
import type { ClientControlTransferOffer, ControlPayload } from '@shugu/protocol';
import { applyClientControlTransferStatus } from './client-transfer';

export function handleClientControlTransferPayload(payload: ControlPayload): void {
  applyClientControlTransferStatus(payload as ClientControlTransferOffer);
}
