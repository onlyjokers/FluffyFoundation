/**
 * Purpose: Shared public and internal types for the Manager SDK.
 */
import type { Message } from '@shugu/protocol';
import type { StateSnapshotPatch } from '../state-snapshot.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ManagerState {
    status: ConnectionStatus;
    managerId: string | null;
    clients: import('@shugu/protocol').ClientInfo[];
    selectedClientIds: string[];
    stateStrategy?: StateSnapshotPatch['stateStrategy'];
    controlPlane?: StateSnapshotPatch['controlPlane'];
    timeSync: import('@shugu/protocol').TimeSyncState;
    error: string | null;
}

export type MessageHandler<T = Message> = (message: T) => void;

export type SocketTransport = 'polling' | 'websocket';

/**
 * Configuration for ManagerSDK
 */
export interface ManagerSDKConfig {
    serverUrl: string;
    autoReconnect?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    timeSyncInterval?: number;
    /**
     * Optional manager key used for server-side role verification.
     */
    managerKey?: string;
    /**
     * Socket.io transports preference.
     * - Default: `['polling', 'websocket']` (best compatibility)
     * - Performance mode: `['websocket']` (less jitter, but may fail on restrictive networks)
     */
    transports?: SocketTransport[];
    /**
     * Minimum interval (ms) between outgoing high-frequency control messages.
     * When many clients are connected, this limits message rate to prevent backpressure.
     * Default: 33 (~30fps). Set to 0 to disable throttling.
     */
    highFreqThrottleMs?: number;
    /**
     * Caller command scope metadata attached to non-system mutating control commands.
     */
    commandEnvelope?: import('../command-envelope.js').CommandEnvelopeInput;
}
