import { io, Socket } from 'socket.io-client';
import {
    Message,
    ControlMessage,
    PluginControlMessage,
    SystemMessage,
    MediaMetaMessage,
    SOCKET_EVENTS,
    isControlMessage,
    isPluginControlMessage,
    isSystemMessage,
    isMediaMetaMessage,
    createSensorDataMessage,
    createTimePing,
    createTimeSyncState,
    getServerTime,
    calculateExecutionDelay,
    scheduleAtServerTime,
    TimeSyncState,
    TimePongData,
    SensorType,
    SensorPayload,
    type ClientControlCapability,
    type ClientPermissions,
    type ControlAction,
    type ControlPayload,
    type TargetSelector,
} from '@shugu/protocol';
import { emitClientControlCommand } from './client-control-transfer.js';
import { emitTimePing, registerClientSocketListeners } from './client-sdk-socket-listeners.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ClientState {
    status: ConnectionStatus;
    clientId: string | null;
    timeSync: TimeSyncState;
    error: string | null;
}

export type MessageHandler<T = Message> = (message: T) => void;

export type SocketTransport = 'polling' | 'websocket';

export type LatestSensorData = {
    sensorType: SensorType;
    payload: SensorPayload;
    /**
     * Local time when the sensor data was produced/sent (ms).
     */
    clientTimestamp: number;
    /**
     * Best-effort server time approximation when produced (ms).
     */
    serverTimestamp: number;
};

export interface ClientIdentity {
    /**
     * Stable ID for a physical device (persist this in localStorage on the client app).
     * Used by the server as the base when generating a unique clientId (e.g. `c_xxx`, `c_xxx_1`).
     */
    deviceId: string;
    /**
     * Stable ID for a browser tab/session (persist this in sessionStorage on the client app).
     * Used to "take over" the same clientId on refresh/reconnect without creating duplicates.
     */
    instanceId: string;
    /**
     * Optional preferred clientId (persist per-tab, e.g. sessionStorage). Server may override to avoid collisions.
     */
    clientId?: string;
}

/**
 * Configuration for ClientSDK
 */
export interface ClientSDKConfig {
    serverUrl: string;
    autoReconnect?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    timeSyncInterval?: number;
    identity?: ClientIdentity;
    /**
     * Socket.io transports preference.
     * - Default: `['polling', 'websocket']` (best compatibility)
     * - Performance mode: `['websocket']` (less jitter, but may fail on restrictive networks)
     */
    transports?: SocketTransport[];
    /**
     * Optional Socket.io query parameters appended to the connection URL.
     * Note: `role` is always forced to `client` by the SDK.
     */
    query?: Record<string, string>;
}

type ClientSDKInternalConfig = {
    serverUrl: string;
    autoReconnect: boolean;
    reconnectionAttempts: number;
    reconnectionDelay: number;
    timeSyncInterval: number;
    identity?: ClientIdentity;
    transports: SocketTransport[];
    query?: Record<string, string>;
};

/**
 * Client SDK for managing Socket.io connection and real-time communication
 */
export class ClientSDK {
    private socket: Socket | null = null;
    private config: ClientSDKInternalConfig;
    private state: ClientState;
    private stateListeners: Set<(state: ClientState) => void> = new Set();
    private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
    private timeSyncIntervalId: ReturnType<typeof setInterval> | null = null;
    private latestSensorData: LatestSensorData | null = null;

    constructor(config: ClientSDKConfig) {
        const defaultTransports: SocketTransport[] = ['polling', 'websocket'];
        const transports = (() => {
            const raw = Array.isArray(config.transports) ? config.transports : defaultTransports;
            const normalized = raw.filter((t): t is SocketTransport => t === 'polling' || t === 'websocket');
            const unique = Array.from(new Set(normalized));
            return unique.length > 0 ? unique : defaultTransports;
        })();

        this.config = {
            serverUrl: config.serverUrl,
            autoReconnect: config.autoReconnect ?? true,
            // Default to unlimited retries; the experience client should survive flaky networks.
            reconnectionAttempts: config.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
            reconnectionDelay: config.reconnectionDelay ?? 1000,
            timeSyncInterval: config.timeSyncInterval ?? 5000,
            identity: config.identity,
            transports,
            query: config.query,
        };

        this.state = {
            status: 'disconnected',
            clientId: null,
            timeSync: createTimeSyncState(),
            error: null,
        };
    }

    /**
     * Connect to the server
     */
    connect(): void {
        if (this.socket) {
            if (this.socket.connected) return;
            this.updateState({ status: 'connecting', error: null });
            this.socket.connect();
            return;
        }

        this.updateState({ status: 'connecting', error: null });

        const auth = this.config.identity ?? undefined;

        this.socket = io(this.config.serverUrl, {
            query: { ...(this.config.query ?? {}), role: 'client' },
            auth,
            transports: this.config.transports,
            // Increase timeouts for mobile networks
            timeout: 20000,
            // Reconnection settings
            reconnection: this.config.autoReconnect,
            reconnectionAttempts: this.config.reconnectionAttempts,
            reconnectionDelay: this.config.reconnectionDelay,
            // Keep retries steady at reconnectionDelay (no exponential backoff / jitter).
            reconnectionDelayMax: this.config.reconnectionDelay,
            randomizationFactor: 0,
            // Force new connection
            forceNew: true,
        });

        this.setupSocketListeners();
    }

    /**
     * Disconnect from server
     */
    disconnect(): void {
        this.stopTimeSync();
        this.socket?.disconnect();
        this.socket = null;
        this.updateState({
            status: 'disconnected',
            clientId: null,
        });
    }

    /**
     * Get current state
     */
    getState(): ClientState {
        return { ...this.state };
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: (state: ClientState) => void): () => void {
        this.stateListeners.add(listener);
        // Immediately call with current state
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }

    /**
     * Subscribe to specific message types
     */
    onMessage<T extends Message = Message>(
        type: 'control' | 'plugin' | 'system' | 'media' | 'all',
        handler: MessageHandler<T>
    ): () => void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type)!.add(handler as MessageHandler);
        return () => this.messageHandlers.get(type)?.delete(handler as MessageHandler);
    }

    /**
     * Subscribe to control messages
     */
    onControl(handler: MessageHandler<ControlMessage>): () => void {
        return this.onMessage('control', handler);
    }

    /**
     * Subscribe to plugin control messages
     */
    onPluginControl(handler: MessageHandler<PluginControlMessage>): () => void {
        return this.onMessage('plugin', handler);
    }

    /**
     * Subscribe to media messages
     */
    onMedia(handler: MessageHandler<MediaMetaMessage>): () => void {
        return this.onMessage('media', handler);
    }

    /**
     * Send sensor data to server
     */
    sendSensorData(
        sensorType: SensorType,
        payload: SensorPayload,
        options?: { trackLatest?: boolean }
    ): void {
        const clientTimestamp = Date.now();
        if (options?.trackLatest !== false) {
            this.latestSensorData = {
                sensorType,
                payload,
                clientTimestamp,
                serverTimestamp: getServerTime(this.state.timeSync),
            };
        }

        if (!this.socket?.connected || !this.state.clientId) return;

        const message = createSensorDataMessage(
            this.state.clientId,
            sensorType,
            payload
        );
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    /**
     * Send the current browser permission snapshot to the server for manager-side client filtering.
     */
    sendClientPermissions(permissions: ClientPermissions): void {
        if (!this.socket?.connected || !this.state.clientId) return;
        this.socket.emit(
            SOCKET_EVENTS.MSG,
            {
                type: 'system' as const,
                version: 1 as const,
                action: 'clientPermissions' as const,
                payload: { permissions: { ...permissions } },
                clientTimestamp: Date.now(),
            }
        );
    }

    /**
     * Send a scoped mutating command as an accepted client controller.
     */
    sendClientControlCommand(
        capability: ClientControlCapability,
        action: ControlAction,
        payload: ControlPayload,
        target: TargetSelector = { mode: 'group', groupId: capability.scopeGroupId },
        executeAt?: number
    ): void {
        emitClientControlCommand({
            socket: this.socket,
            clientId: this.state.clientId,
            capability,
            action,
            payload,
            target,
            executeAt,
        });
    }

    /**
     * Deny a pending transfer before control authority has been accepted.
     */
    sendClientControlTransferDeny(capability: ClientControlCapability, transferId: string, reason?: string): void {
        emitClientControlCommand({
            socket: this.socket,
            clientId: this.state.clientId,
            capability,
            action: 'clientControlTransfer',
            payload: {
                kind: 'client-control-transfer',
                action: 'deny',
                transferId,
                ...(reason ? { reason } : {}),
            },
        });
    }

    /**
     * Latest locally produced sensor message (best-effort snapshot).
     * Useful for client-side execution (e.g. node-executor) even when offline.
     */
    getLatestSensorData(): LatestSensorData | null {
        return this.latestSensorData ? { ...this.latestSensorData } : null;
    }

    /**
     * Get current server time
     */
    getServerTime(): number {
        return getServerTime(this.state.timeSync);
    }

    /**
     * Get time offset
     */
    getOffset(): number {
        return this.state.timeSync.offset;
    }

    /**
     * Schedule action at server time
     */
    scheduleAt(executeAt: number, callback: () => void): { cancel: () => void; delay: number } {
        return scheduleAtServerTime(executeAt, this.state.timeSync, callback);
    }

    /**
     * Calculate delay until server time
     */
    getDelayUntil(serverTime: number): number {
        return calculateExecutionDelay(serverTime, this.state.timeSync);
    }

    private setupSocketListeners(): void {
        if (!this.socket) return;
        registerClientSocketListeners({
            socket: this.socket,
            autoReconnect: this.config.autoReconnect,
            updateState: (partial) => this.updateState(partial as Partial<ClientState>),
            startTimeSync: () => this.startTimeSync(),
            stopTimeSync: () => this.stopTimeSync(),
            getTimeSync: () => this.state.timeSync,
            setTimeSync: (timeSync) => this.updateState({ timeSync }),
            handleMessage: (message) => this.handleMessage(message),
        });
    }

    private handleMessage(message: Message): void {
        // Handle system messages internally
        if (isSystemMessage(message)) {
            this.handleSystemMessage(message as SystemMessage);
        }

        // Dispatch to type-specific handlers
        if (isControlMessage(message)) {
            this.dispatchMessage('control', message);
        } else if (isPluginControlMessage(message)) {
            this.dispatchMessage('plugin', message);
        } else if (isMediaMetaMessage(message)) {
            this.dispatchMessage('media', message);
        } else if (isSystemMessage(message)) {
            this.dispatchMessage('system', message);
        }

        // Also dispatch to 'all' handlers
        this.dispatchMessage('all', message);
    }

    private handleSystemMessage(message: SystemMessage): void {
        switch (message.action) {
            case 'clientRegistered':
                if (message.payload.clientId) {
                    const assignedClientId = message.payload.clientId;
                    this.updateState({ clientId: assignedClientId });
                    console.log('[SDK Client] Registered as:', assignedClientId);

                    // Persist the server-assigned clientId into auth so reconnects keep the same ID.
                    if (this.socket && this.config.identity) {
                        this.config.identity = { ...this.config.identity, clientId: assignedClientId };
                        const existingAuth = (this.socket.auth ?? {}) as Record<string, unknown>;
                        this.socket.auth = { ...existingAuth, clientId: assignedClientId };
                    }
                }
                break;
        }
    }

    private dispatchMessage(type: string, message: Message): void {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    console.error('[SDK Client] Message handler error:', error);
                }
            });
        }
    }

    private updateState(partial: Partial<ClientState>): void {
        this.state = { ...this.state, ...partial };
        this.stateListeners.forEach(listener => {
            try {
                listener(this.getState());
            } catch (error) {
                console.error('[SDK Client] State listener error:', error);
            }
        });
    }

    private startTimeSync(): void {
        // Do immediate sync
        this.doTimeSync();

        // Set up interval
        this.timeSyncIntervalId = setInterval(() => {
            this.doTimeSync();
        }, this.config.timeSyncInterval);
    }

    private stopTimeSync(): void {
        if (this.timeSyncIntervalId) {
            clearInterval(this.timeSyncIntervalId);
            this.timeSyncIntervalId = null;
        }
    }

    private doTimeSync(): void {
        emitTimePing(this.socket);
    }

    /**
     * Send a ping to measure latency
     * Returns RTT in ms
     */
    async ping(): Promise<number> {
        if (!this.socket?.connected) throw new Error('Not connected');
        
        const start = performance.now();
        return new Promise<number>((resolve, reject) => {
            if (!this.socket) return reject(new Error('Socket closed'));
            
            // We'll use a one-off event listener for the pong
            // Note: server needs to support generic ping/pong or we reuse time:ping
            // We simply reuse time:ping for now as it's already there
            const pingData = createTimePing();
            
            const handlePong = (data: TimePongData) => {
                if (data.clientTimestamp === pingData.clientTimestamp) {
                    const rtt = performance.now() - start;
                    this.socket?.off(SOCKET_EVENTS.TIME_PONG, handlePong);
                    resolve(rtt);
                }
            };

            this.socket.on(SOCKET_EVENTS.TIME_PONG, handlePong);
            this.socket.emit(SOCKET_EVENTS.TIME_PING, pingData);
            
            // Timeout
            setTimeout(() => {
                this.socket?.off(SOCKET_EVENTS.TIME_PONG, handlePong);
                reject(new Error('Ping timeout'));
            }, 5000);
        });
    }
}
