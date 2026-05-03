/**
 * Purpose: Shared client runtime helpers for transfer status during socket lifecycle changes.
 */
import type { Writable } from 'svelte/store';
import type { ClientControlTransferOffer } from '@shugu/protocol';

export function markTransferControlLost(
  store: Writable<ClientControlTransferOffer | null>,
  at = Date.now()
): void {
  store.update((current) =>
    current?.status === 'accepted'
      ? { ...current, status: 'control-lost', revokedAt: at, reason: 'client disconnected' }
      : current
  );
}
