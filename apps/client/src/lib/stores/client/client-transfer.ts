/**
 * Purpose: Store client-side FF-13 transfer confirmation/status state.
 */
import { writable } from 'svelte/store';
import type { ClientControlTransferOffer } from '@shugu/protocol';

export const clientControlTransfer = writable<ClientControlTransferOffer | null>(null);

export function applyClientControlTransferStatus(status: ClientControlTransferOffer): void {
  clientControlTransfer.set(status);
}

export function clearClientControlTransfer(): void {
  clientControlTransfer.set(null);
}

export function formatClientControlTransferStatus(status: ClientControlTransferOffer | null): string {
  if (!status) return 'No client control';
  if (status.status === 'pending') return 'Pending control request';
  if (status.status === 'accepted') return 'Client control active';
  if (status.status === 'denied') return 'Client control denied';
  if (status.status === 'expired') return 'Client control expired';
  if (status.status === 'revoked') return 'Client control revoked';
  if (status.status === 'control-lost') return 'Client control lost';
  return 'No client control';
}
