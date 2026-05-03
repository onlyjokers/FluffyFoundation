/**
 * Purpose: Manager-store helpers for FF-13 client control transfer commands.
 */
import type { ManagerSDK } from '@shugu/sdk-manager';

export function offerClientControlTransferWithSdk(
  sdk: ManagerSDK | null,
  groupId: string,
  targetClientId: string,
  ttlMs = 30_000
): void {
  sdk?.offerClientControlTransfer({ groupId, targetClientId, ttlMs });
}

export function revokeClientControlTransferWithSdk(
  sdk: ManagerSDK | null,
  transferId: string,
  groupId: string
): void {
  sdk?.revokeClientControlTransfer({ transferId, groupId });
}
