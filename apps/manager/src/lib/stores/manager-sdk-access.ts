/**
 * Purpose: Hold the manager SDK singleton outside the large manager store entrypoint.
 */
import type { ManagerSDK } from '@shugu/sdk-manager';

let sdk: ManagerSDK | null = null;

export function setManagerSDK(next: ManagerSDK | null): void {
  sdk = next;
}

export function getManagerSDK(): ManagerSDK | null {
  return sdk;
}
