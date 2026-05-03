/**
 * Purpose: Send client transfer accept/deny/control commands through the scoped SDK envelope.
 */
import type { ClientSDK } from '@shugu/sdk-client';
import type { ClientControlTransferOffer } from '@shugu/protocol';

export function sendTransferResponse(
  sdk: ClientSDK | null,
  current: ClientControlTransferOffer | null,
  action: 'accept' | 'deny'
): ClientControlTransferOffer | null {
  if (!current || !sdk) return null;
  if (action === 'accept') {
    sdk.sendClientControlCommand(current.capability, 'clientControlTransfer', {
      kind: 'client-control-transfer',
      action,
      transferId: current.transferId,
    });
    return { ...current, status: 'accepted', acceptedAt: Date.now() };
  }

  sdk.sendClientControlTransferDeny(current.capability, current.transferId);
  return { ...current, status: 'denied', deniedAt: Date.now() };
}
