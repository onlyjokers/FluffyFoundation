/**
 * Purpose: State helpers for Manager SDK listener notification.
 */
import { createTimeSyncState } from '@shugu/protocol';
import type { ManagerState } from './types.js';

export function createInitialManagerState(): ManagerState {
    return {
        status: 'disconnected',
        managerId: null,
        clients: [],
        selectedClientIds: [],
        timeSync: createTimeSyncState(),
        error: null,
    };
}

export function notifyManagerStateListeners(
    state: ManagerState,
    listeners: Set<(state: ManagerState) => void>
): void {
    listeners.forEach(listener => {
        try {
            listener({ ...state });
        } catch (error) {
            console.error('[SDK Manager] State listener error:', error);
        }
    });
}
