import { io, Socket } from 'socket.io-client';
import {
    Message,
    SystemMessage,
    SensorDataMessage,
    MediaMetaMessage,
    ClientInfo,
    SOCKET_EVENTS,
    isSensorDataMessage,
    isSystemMessage,
    createControlMessage,
    createPluginControlMessage,
    createMediaMetaMessage,
    createTimePing,
    processTimePong,
    createTimeSyncState,
    updateTimeSyncState,
    getServerTime,
    TimeSyncState,
    TimePongData,
    TargetSelector,
    ControlAction,
    BaseControlPayload,
    ControlPayload,
    ControlBatchPayload,
    type ControlBatchItem,
    ScreenColorPayload,
    PluginId,
    PluginCommand,
    MediaType,
    VisualSceneLayerItem,
    targetAll,
    targetClients,
} from '@shugu/protocol';
import { mergeControlPayload } from './payload-merge.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ManagerState {
    status: ConnectionStatus;
    managerId: string | null;
    clients: ClientInfo[];
    selectedClientIds: string[];
    timeSync: TimeSyncState;
    error: string | null;
}

export type MessageHandler<T = Message> = (message: T) => void;

export type SocketTransport = 'polling' | 'websocket';

const isControlBatchPayload = (payload: ControlPayload): payload is ControlBatchPayload =>
    typeof payload === 'object' && payload !== null && 'kind' in payload && (payload as ControlBatchPayload).kind === 'control-batch';

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
}

/**
 * Manager SDK for managing Socket.io connection and controlling clients
 */
export class ManagerSDK {
    private socket: Socket | null = null;
    private config: Required<ManagerSDKConfig>;
    private state: ManagerState;
    private stateListeners: Set<(state: ManagerState) => void> = new Set();
    private sensorDataHandlers: Set<MessageHandler<SensorDataMessage>> = new Set();
    private timeSyncIntervalId: ReturnType<typeof setInterval> | null = null;

    // Batch multiple `sendControl(...)` calls in the same tick into a single `custom` message.
    private pendingControlByTargetKey: Map<
        string,
        { target: TargetSelector; items: ControlBatchItem[] }
    > = new Map();
    private pendingControlFlushScheduled = false;

    // Time-based throttling for high-frequency updates (MIDI-driven modulation, etc.)
    // Key: action type, Value: last sent timestamp
    private lastSentByAction: Map<string, number> = new Map();
    // Actions that benefit from throttling when sending to many clients
    private static THROTTLED_ACTIONS = new Set([
        'modulateSoundUpdate',
        'screenColor',
        'flashlight',
        'vibrate',
    ]);

    constructor(config: ManagerSDKConfig) {
        const transports: SocketTransport[] = (() => {
            const defaults: SocketTransport[] = ['polling', 'websocket'];
            const raw = Array.isArray(config.transports) ? config.transports : defaults;
            const normalized = raw.filter((t): t is SocketTransport => t === 'polling' || t === 'websocket');
            const unique = Array.from(new Set(normalized));
            return unique.length > 0 ? unique : defaults;
        })();

        this.config = {
            serverUrl: config.serverUrl,
            autoReconnect: config.autoReconnect ?? true,
            // Default to unlimited retries to keep the control UI resilient.
            reconnectionAttempts: config.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
            reconnectionDelay: config.reconnectionDelay ?? 1000,
            timeSyncInterval: config.timeSyncInterval ?? 5000,
            transports,
            // Throttle high-frequency updates to ~30fps by default to prevent backpressure
            highFreqThrottleMs: config.highFreqThrottleMs ?? 33,
            managerKey: typeof config.managerKey === 'string' ? config.managerKey.trim() : '',
        };

        this.state = {
            status: 'disconnected',
            managerId: null,
            clients: [],
            selectedClientIds: [],
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

        this.socket = io(this.config.serverUrl, {
            query: { role: 'manager' },
            auth: this.config.managerKey ? { managerKey: this.config.managerKey } : undefined,
            transports: this.config.transports,
            // Increase timeouts
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
            managerId: null,
            clients: [],
        });
    }

    /**
     * Get current state
     */
    getState(): ManagerState {
        return { ...this.state };
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: (state: ManagerState) => void): () => void {
        this.stateListeners.add(listener);
        // Immediately call with current state
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }

    /**
     * Subscribe to sensor data from clients
     */
    onSensorData(handler: MessageHandler<SensorDataMessage>): () => void {
        this.sensorDataHandlers.add(handler);
        return () => this.sensorDataHandlers.delete(handler);
    }

    /**
     * Select clients
     */
    selectClients(clientIds: string[]): void {
        this.updateState({ selectedClientIds: clientIds });
        // Notify server of selection
        this.socket?.emit('select:clients', { clientIds });
    }

    /**
     * Select all clients
     */
    selectAll(): void {
        const allIds = this.state.clients.map(c => c.clientId);
        this.selectClients(allIds);
    }

    /**
     * Clear selection
     */
    clearSelection(): void {
        this.selectClients([]);
    }

    /**
     * Send control message to target
     */
    sendControl(
        target: TargetSelector,
        action: ControlAction,
        payload: ControlPayload,
        executeAt?: number
    ): void {
        if (!this.socket?.connected) return;

        // Avoid wrapping custom payloads (unknown semantics) unless it is already a control-batch.
        if (action === 'custom') {
            if (isControlBatchPayload(payload)) {
                const message = createControlMessage(target, action, payload, executeAt);
                this.socket.emit(SOCKET_EVENTS.MSG, message);
                return;
            }

            const message = createControlMessage(target, action, payload, executeAt);
            this.socket.emit(SOCKET_EVENTS.MSG, message);
            return;
        }

        this.queueControl(target, { action, payload: payload as BaseControlPayload, executeAt });
    }

    /**
     * Send multiple control actions in a single message (ControlAction: 'custom').
     *
     * This is used to keep MIDI-driven updates in sync and reduce server message pressure.
     */
    sendControlBatch(target: TargetSelector, items: ControlBatchItem[], executeAt?: number): void {
        if (!this.socket?.connected) return;
        const payload: ControlBatchPayload = {
            kind: 'control-batch',
            items,
            ...(typeof executeAt === 'number' && Number.isFinite(executeAt) ? { executeAt } : {}),
        };
        const message = createControlMessage(target, 'custom', payload, executeAt);
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    private targetKey(target: TargetSelector): string {
        if (target.mode === 'all') return 'all';
        if (target.mode === 'group') return `group:${target.groupId}`;
        const ids = (target.ids ?? []).map(String).filter(Boolean).sort();
        return `clientIds:${ids.join(',')}`;
    }

    private normalizeTarget(target: TargetSelector): TargetSelector {
        if (target.mode !== 'clientIds') return target;
        const ids = (target.ids ?? []).map(String).filter(Boolean).sort();
        return { mode: 'clientIds', ids };
    }

    private queueControl(target: TargetSelector, item: ControlBatchItem): void {
        // Time-based throttling for high-frequency actions when many clients are connected
        const throttleMs = this.config.highFreqThrottleMs;
        if (throttleMs > 0 && ManagerSDK.THROTTLED_ACTIONS.has(item.action)) {
            const clientCount = this.state.clients.length;
            // Only throttle when there are multiple clients (reduces overhead when testing/dev)
            if (clientCount > 10) {
                const now = Date.now();
                const lastSent = this.lastSentByAction.get(item.action) ?? 0;
                if (now - lastSent < throttleMs) {
                    // Skip this update - too soon since the last one
                    // Store the latest payload so it will be picked up on next flush
                    const pendingKey = `pending:${item.action}`;
                    this.lastSentByAction.set(pendingKey, now);
                    return;
                }
                this.lastSentByAction.set(item.action, now);
            }
        }

        const key = this.targetKey(target);
        const existing = this.pendingControlByTargetKey.get(key) ?? {
            target: this.normalizeTarget(target),
            items: [],
        };

        // Optional optimization: merge "update" style actions in the same tick (keep last, merge payload fields).
        if (item.action === 'modulateSoundUpdate') {
            const idx = existing.items.findIndex((entry) => entry.action === 'modulateSoundUpdate');
            if (idx >= 0) {
                const prev = existing.items[idx];
                existing.items[idx] = {
                    action: 'modulateSoundUpdate',
                    payload: mergeControlPayload(prev.payload, item.payload),
                    executeAt: item.executeAt ?? prev.executeAt,
                };
            } else {
                existing.items.push(item);
            }
        } else {
            existing.items.push(item);
        }

        this.pendingControlByTargetKey.set(key, existing);

        if (this.pendingControlFlushScheduled) return;
        this.pendingControlFlushScheduled = true;
        queueMicrotask(() => this.flushQueuedControls());
    }

    private flushQueuedControls(): void {
        this.pendingControlFlushScheduled = false;
        if (!this.socket?.connected) {
            this.pendingControlByTargetKey.clear();
            return;
        }

        for (const entry of this.pendingControlByTargetKey.values()) {
            if (entry.items.length === 0) continue;

            if (entry.items.length === 1) {
                const single = entry.items[0];
                const message = createControlMessage(entry.target, single.action, single.payload, single.executeAt);
                this.socket.emit(SOCKET_EVENTS.MSG, message);
                continue;
            }

            const sharedExecuteAt = entry.items[0].executeAt;
            const hasSharedExecuteAt =
                typeof sharedExecuteAt === 'number' &&
                Number.isFinite(sharedExecuteAt) &&
                entry.items.every((item) => item.executeAt === sharedExecuteAt);

            if (hasSharedExecuteAt) {
                const items = entry.items.map(({ action, payload }) => ({ action, payload }));
                this.sendControlBatch(entry.target, items, sharedExecuteAt);
                continue;
            }

            this.sendControlBatch(entry.target, entry.items, undefined);
        }

        this.pendingControlByTargetKey.clear();
    }

    /**
     * Send control to selected clients
     */
    sendControlToSelected(
        action: ControlAction,
        payload: ControlPayload,
        executeAt?: number
    ): void {
        if (this.state.selectedClientIds.length === 0) return;
        this.sendControl(
            targetClients(this.state.selectedClientIds),
            action,
            payload,
            executeAt
        );
    }

    /**
     * Send control to all clients
     */
    sendControlToAll(
        action: ControlAction,
        payload: ControlPayload,
        executeAt?: number
    ): void {
        this.sendControl(targetAll(), action, payload, executeAt);
    }

    /**
     * Send plugin control message
     */
    sendPluginControl(
        target: TargetSelector,
        pluginId: PluginId,
        command: PluginCommand,
        payload?: Record<string, unknown>
    ): void {
        if (!this.socket?.connected) return;
        const message = createPluginControlMessage(target, pluginId, command, payload);
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    /**
     * Send media message
     */
    sendMedia(
        target: TargetSelector,
        mediaType: MediaType,
        url: string,
        executeAt: number,
        options?: MediaMetaMessage['options']
    ): void {
        if (!this.socket?.connected) return;
        const message = createMediaMetaMessage(target, mediaType, url, executeAt, options);
        this.socket.emit(SOCKET_EVENTS.MSG, message);
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
     * Schedule execution at future server time
     */
    scheduleAt(delayMs: number): number {
        return this.getServerTime() + delayMs;
    }

    // Convenience methods for common actions

    /**
     * Control flashlight on all or selected clients
     */
    flashlight(mode: 'off' | 'on' | 'blink', options?: { frequency?: number; dutyCycle?: number }, toAll = false, executeAt?: number): void {
        const payload = { mode, ...options };
        if (toAll) {
            this.sendControlToAll('flashlight', payload, executeAt);
        } else {
            this.sendControlToSelected('flashlight', payload, executeAt);
        }
    }

    /**
     * Control vibration
     */
    vibrate(pattern: number[], repeat?: number, toAll = false, executeAt?: number): void {
        const payload = { pattern, repeat };
        if (toAll) {
            this.sendControlToAll('vibrate', payload, executeAt);
        } else {
            this.sendControlToSelected('vibrate', payload, executeAt);
        }
    }

    /**
     * Play synthesized modulation tone on clients
     */
    modulateSound(
        options: {
            frequency?: number;
            duration?: number;
            volume?: number;
            waveform?: 'sine' | 'square' | 'sawtooth' | 'triangle';
            modFrequency?: number;
            modDepth?: number;
            attack?: number;
            release?: number;
        },
        toAll = false,
        executeAt?: number
    ): void {
        const payload = { ...options };
        if (toAll) {
            this.sendControlToAll('modulateSound', payload, executeAt);
        } else {
            this.sendControlToSelected('modulateSound', payload, executeAt);
        }
    }

    /**
     * Update synthesized tone parameters without restarting playback
     */
    modulateSoundUpdate(
        options: {
            frequency?: number;
            volume?: number;
            waveform?: 'sine' | 'square' | 'sawtooth' | 'triangle';
            modFrequency?: number;
            modDepth?: number;
            durationMs?: number;
        },
        toAll = false,
        executeAt?: number
    ): void {
        const payload = { ...options };
        if (toAll) {
            this.sendControlToAll('modulateSoundUpdate', payload, executeAt);
        } else {
            this.sendControlToSelected('modulateSoundUpdate', payload, executeAt);
        }
    }

    /**
     * Control screen color
     */
    screenColor(payload: { color: string; opacity?: number } | ScreenColorPayload, toAll = false, executeAt?: number): void {
        const normalized: ScreenColorPayload = 'mode' in payload || Array.isArray((payload as ScreenColorPayload).cycleColors)
            ? { mode: 'solid', opacity: 1, ...(payload as ScreenColorPayload) }
            : { color: (payload as { color: string }).color, opacity: (payload as { opacity?: number }).opacity, mode: 'solid' };

        normalized.color = normalized.color ?? '#ffffff';
        normalized.mode = normalized.mode ?? 'solid';
        normalized.opacity = normalized.opacity ?? 1;

        if (toAll) {
            this.sendControlToAll('screenColor', normalized, executeAt);
        } else {
            this.sendControlToSelected('screenColor', normalized, executeAt);
        }
    }

    /**
     * Play sound on clients
     */
    playSound(url: string, options?: { volume?: number; loop?: boolean }, toAll = false, executeAt?: number): void {
        const payload = { url, ...options };
        if (toAll) {
            this.sendControlToAll('playSound', payload, executeAt);
        } else {
            this.sendControlToSelected('playSound', payload, executeAt);
        }
    }

    /**
     * Play media (audio or video) on clients
     */
    playMedia(
        url: string,
        options?: {
            mediaType?: 'audio' | 'video';
            volume?: number;
            loop?: boolean;
            muted?: boolean;
            fadeIn?: number;
        },
        toAll = false,
        executeAt?: number
    ): void {
        const payload = { url, ...options };
        if (toAll) {
            this.sendControlToAll('playMedia', payload, executeAt);
        } else {
            this.sendControlToSelected('playMedia', payload, executeAt);
        }
    }

    /**
     * Stop all media on clients
     */
    stopMedia(toAll = false): void {
        if (toAll) {
            this.sendControlToAll('stopMedia', {});
        } else {
            this.sendControlToSelected('stopMedia', {});
        }
    }

    stopSound(toAll = false): void {
        if (toAll) {
            this.sendControlToAll('stopSound', {});
        } else {
            this.sendControlToSelected('stopSound', {});
        }
    }

    /**
     * Show image on clients
     */
    showImage(url: string, options?: { duration?: number }, toAll = false, executeAt?: number): void {
        const payload = { url, ...options };
        if (toAll) {
            this.sendControlToAll('showImage', payload, executeAt);
        } else {
            this.sendControlToSelected('showImage', payload, executeAt);
        }
    }

    /**
     * Hide image on clients
     */
    hideImage(toAll = false): void {
        if (toAll) {
            this.sendControlToAll('hideImage', {});
        } else {
            this.sendControlToSelected('hideImage', {});
        }
    }

    /**
     * Set the ordered visual scene layer list.
     */
    setVisualScenes(scenes: VisualSceneLayerItem[], toAll = false, executeAt?: number): void {
        const payload = { scenes };
        if (toAll) {
            this.sendControlToAll('visualScenes', payload, executeAt);
        } else {
            this.sendControlToSelected('visualScenes', payload, executeAt);
        }
    }

    private setupSocketListeners(): void {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[SDK Manager] Connected');
            this.updateState({ status: 'connected', error: null });
            this.startTimeSync();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SDK Manager] Disconnected:', reason);
            this.stopTimeSync();

            // socket.io does not auto-reconnect if the server explicitly disconnected us.
            if (this.config.autoReconnect && reason !== 'io client disconnect') {
                this.updateState({ status: 'reconnecting', managerId: null });

                if (reason === 'io server disconnect') {
                    this.socket?.connect();
                }
                return;
            }

            this.updateState({ status: 'disconnected', managerId: null });
        });

        this.socket.on('connect_error', (error) => {
            console.error('[SDK Manager] Connection error:', error.message);
            this.updateState({ status: 'error', error: error.message });
        });

        this.socket.io.on('reconnect_attempt', () => {
            this.updateState({ status: 'reconnecting' });
        });

        this.socket.io.on('reconnect', () => {
            console.log('[SDK Manager] Reconnected');
            this.updateState({ status: 'connected', error: null });
        });

        // Handle messages
        this.socket.on(SOCKET_EVENTS.MSG, (message: Message) => {
            this.handleMessage(message);
        });

        // Handle time sync pong
        this.socket.on(SOCKET_EVENTS.TIME_PONG, (data: TimePongData) => {
            const result = processTimePong(data);
            const newTimeSync = updateTimeSyncState(this.state.timeSync, result);
            this.updateState({ timeSync: newTimeSync });
        });
    }

    private handleMessage(message: Message): void {
        if (isSensorDataMessage(message)) {
            // Dispatch sensor data to handlers
            this.sensorDataHandlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    console.error('[SDK Manager] Sensor data handler error:', error);
                }
            });
        } else if (isSystemMessage(message)) {
            this.handleSystemMessage(message as SystemMessage);
        }
    }

    private handleSystemMessage(message: SystemMessage): void {
        switch (message.action) {
            case 'clientRegistered':
                if (message.payload.clientId) {
                    this.updateState({ managerId: message.payload.clientId });
                    console.log('[SDK Manager] Registered as:', message.payload.clientId);
                }
                break;
            case 'clientList':
                if (message.payload.clients) {
                    this.updateState({ clients: message.payload.clients });
                }
                break;
            case 'clientJoined':
                console.log('[SDK Manager] Client joined:', message.payload.clientId);
                break;
            case 'clientLeft': {
                console.log('[SDK Manager] Client left:', message.payload.clientId);
                // Remove from selection if selected
                const remaining = this.state.selectedClientIds.filter(
                    id => id !== message.payload.clientId
                );
                if (remaining.length !== this.state.selectedClientIds.length) {
                    this.updateState({ selectedClientIds: remaining });
                }
                break;
            }
        }
    }

    private updateState(partial: Partial<ManagerState>): void {
        this.state = { ...this.state, ...partial };
        this.stateListeners.forEach(listener => {
            try {
                listener(this.getState());
            } catch (error) {
                console.error('[SDK Manager] State listener error:', error);
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
        if (!this.socket?.connected) return;
        const pingData = createTimePing();
        this.socket.emit(SOCKET_EVENTS.TIME_PING, pingData);
    }
}
