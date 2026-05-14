/**
 * Purpose: Persist display device/session identity used by the client SDK.
 */
import type { ClientIdentity } from '@shugu/sdk-client';

const DISPLAY_DEVICE_ID_STORAGE_KEY = 'shugu-display-device-id';
const DISPLAY_INSTANCE_ID_STORAGE_KEY = 'shugu-display-instance-id';
const DISPLAY_CLIENT_ID_STORAGE_KEY = 'shugu-display-client-id';

function createRandomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function getOrCreateStorageId(storage: Storage, key: string, prefix: string): string {
  const existing = storage.getItem(key);
  if (existing && existing.trim()) return existing;
  const id = createRandomId(prefix);
  storage.setItem(key, id);
  return id;
}

export function getOrCreateDisplayIdentity(): ClientIdentity | null {
  if (typeof window === 'undefined') return null;

  const deviceId = getOrCreateStorageId(window.localStorage, DISPLAY_DEVICE_ID_STORAGE_KEY, 'd_');
  const instanceId = getOrCreateStorageId(window.sessionStorage, DISPLAY_INSTANCE_ID_STORAGE_KEY, 'i_');

  const storedClientId = window.sessionStorage.getItem(DISPLAY_CLIENT_ID_STORAGE_KEY);
  const clientId = storedClientId && storedClientId.trim() ? storedClientId : deviceId;
  window.sessionStorage.setItem(DISPLAY_CLIENT_ID_STORAGE_KEY, clientId);

  return { deviceId, instanceId, clientId };
}

export function persistAssignedClientId(assignedClientId: string): void {
  if (typeof window === 'undefined') return;
  if (!assignedClientId) return;
  const current = window.sessionStorage.getItem(DISPLAY_CLIENT_ID_STORAGE_KEY);
  if (current === assignedClientId) return;
  window.sessionStorage.setItem(DISPLAY_CLIENT_ID_STORAGE_KEY, assignedClientId);
}
