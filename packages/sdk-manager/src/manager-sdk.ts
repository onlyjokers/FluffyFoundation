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
    type ExecutionPartition,
    type PartitionLifecyclePayload,
    ScreenColorPayload,
    PluginId,
    PluginCommand,
    MediaType,
    VisualSceneLayerItem,
    targetAll,
    targetClients,
    type DeliveryMetrics,
    type DisplayOperation,
} from '@shugu/protocol';
import {
    nextManagerCommandEnvelope,
    nextManagerCommandEnvelopeForTarget,
    normalizeManagerCommandEnvelope,
    type CommandEnvelope,
    type CommandEnvelopeInput,
} from './command-envelope.js';
import { sendControlByAudience } from './controls.js';
import { ManagerDeliveryQueue } from './delivery-queue.js';
import { createStateSnapshotPatch, type StateSnapshotPatch } from './state-snapshot.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ManagerState {
    status: ConnectionStatus;
    managerId: string | null;
    clients: ClientInfo[];
    selectedClientIds: string[];
    stateStrategy?: StateSnapshotPatch['stateStrategy'];
    controlPlane?: StateSnapshotPatch['controlPlane'];
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
    /**
     * Caller command scope metadata attached to non-system mutating control commands.
     */
    commandEnvelope?: CommandEnvelopeInput;
}

/**
 * Manager SDK for managing Socket.io connection and controlling clients
 */
export class ManagerSDK {
    private socket: Socket | null = null;
    private config: Required<Omit<ManagerSDKConfig, 'commandEnvelope'>> & Pick<ManagerSDKConfig, 'commandEnvelope'>;
    private state: ManagerState;
    private commandEnvelope: CommandEnvelope;
    private stateListeners: Set<(state: ManagerState) => void> = new Set();
    private sensorDataHandlers: Set<MessageHandler<SensorDataMessage>> = new Set();
    private timeSyncIntervalId: ReturnType<typeof setInterval> | null = null;
    private readonly deliveryQueue: ManagerDeliveryQueue;

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
            commandEnvelope: config.commandEnvelope,
        };
        this.commandEnvelope = normalizeManagerCommandEnvelope(this.config.commandEnvelope);
        this.deliveryQueue = new ManagerDeliveryQueue({
            getSocket: () => this.socket,
            getClientCount: () => this.state.clients.length,
            getThrottleMs: () => this.config.highFreqThrottleMs,
            nextCommandEnvelope: (target) => this.nextCommandEnvelope(target),
        });

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
        this.deliveryQueue.clearPendingLatestState();
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
                this.deliveryQueue.emit(target, action, payload, executeAt);
                return;
            }

            this.deliveryQueue.emit(target, action, payload as BaseControlPayload, executeAt);
            return;
        }

        this.deliveryQueue.queueControl(target, { action, payload: payload as BaseControlPayload, executeAt });
    }

    /**
     * Send multiple control actions in a single message (ControlAction: 'custom').
     *
     * This is used to keep MIDI-driven updates in sync and reduce server message pressure.
     */
    sendControlBatch(target: TargetSelector, items: ControlBatchItem[], executeAt?: number): void {
        this.deliveryQueue.sendControlBatch(target, items, executeAt);
    }

    getDeliveryMetrics(): DeliveryMetrics {
        return this.deliveryQueue.getMetrics();
    }

    private nextCommandEnvelope(target?: TargetSelector): CommandEnvelope {
        return target
            ? nextManagerCommandEnvelopeForTarget(this.commandEnvelope, target)
            : nextManagerCommandEnvelope(this.commandEnvelope);
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
        const message = createPluginControlMessage(this.nextCommandEnvelope(target), target, pluginId, command, payload);
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    sendDisplayOperation(operation: DisplayOperation): void {
        this.sendPluginControl(
            { mode: 'group', groupId: this.commandEnvelope.scopeGroupId },
            'display-router',
            'display-operation',
            operation as unknown as Record<string, unknown>
        );
    }

    deployPartition(input: {
        groupId: string;
        partition: ExecutionPartition;
        currentRevision?: number;
        availableCapabilities?: string[];
    }): void {
        this.sendPartitionLifecycle({
            groupId: input.groupId,
            operation: 'deploy',
            partition: input.partition,
            currentRevision: input.currentRevision,
            availableCapabilities: input.availableCapabilities,
        });
    }

    startPartition(input: { groupId: string; partitionId: string; currentRevision?: number }): void {
        this.sendPartitionLifecycle({
            groupId: input.groupId,
            operation: 'start',
            partitionId: input.partitionId,
            currentRevision: input.currentRevision,
        });
    }

    stopPartition(input: { groupId: string; partitionId: string; currentRevision?: number }): void {
        this.sendPartitionLifecycle({
            groupId: input.groupId,
            operation: 'stop',
            partitionId: input.partitionId,
            currentRevision: input.currentRevision,
        });
    }

    removePartition(input: { groupId: string; partitionId: string; currentRevision?: number }): void {
        this.sendPartitionLifecycle({
            groupId: input.groupId,
            operation: 'remove',
            partitionId: input.partitionId,
            currentRevision: input.currentRevision,
        });
    }

    redeployPartition(input: { groupId: string; partitionId: string; currentRevision?: number }): void {
        this.sendPartitionLifecycle({
            groupId: input.groupId,
            operation: 'redeploy',
            partitionId: input.partitionId,
            currentRevision: input.currentRevision,
        });
    }

    private sendPartitionLifecycle(input: { groupId: string } & Omit<PartitionLifecyclePayload, 'kind'>): void {
        if (!this.socket?.connected) return;
        const command = input.operation === 'redeploy' ? 'deploy' : input.operation;
        const payload: PartitionLifecyclePayload = {
            kind: 'partition-lifecycle',
            operation: input.operation,
            ...(input.partition ? { partition: input.partition } : {}),
            ...(input.partitionId ? { partitionId: input.partitionId } : {}),
            ...(typeof input.currentRevision === 'number' ? { currentRevision: input.currentRevision } : {}),
            ...(input.availableCapabilities ? { availableCapabilities: input.availableCapabilities } : {}),
        };
        const message = createPluginControlMessage(
            this.nextCommandEnvelope(),
            { mode: 'group', groupId: input.groupId },
            'node-executor',
            command,
            payload
        );
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    /**
     * Offer temporary Group control to a target client. Server owns TTL, confirmation, and owner recovery.
     */
    offerClientControlTransfer(input: { groupId: string; targetClientId: string; ttlMs?: number }): void {
        if (!this.socket?.connected) return;
        const message = createControlMessage(
            this.nextCommandEnvelope(),
            { mode: 'group', groupId: input.groupId },
            'clientControlTransfer',
            {
                kind: 'client-control-transfer',
                action: 'offer',
                groupId: input.groupId,
                targetClientId: input.targetClientId,
                ...(typeof input.ttlMs === 'number' && Number.isFinite(input.ttlMs) ? { ttlMs: input.ttlMs } : {}),
            }
        );
        this.socket.emit(SOCKET_EVENTS.MSG, message);
    }

    revokeClientControlTransfer(input: { transferId: string; groupId: string; reason?: string }): void {
        if (!this.socket?.connected) return;
        const message = createControlMessage(
            this.nextCommandEnvelope(),
            { mode: 'group', groupId: input.groupId },
            'clientControlTransfer',
            {
                kind: 'client-control-transfer',
                action: 'revoke',
                transferId: input.transferId,
                groupId: input.groupId,
                ...(input.reason ? { reason: input.reason } : {}),
            }
        );
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
        const message = createMediaMetaMessage(this.nextCommandEnvelope(), target, mediaType, url, executeAt, options);
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
        this.sendAudienceControl(toAll, 'flashlight', { mode, ...options }, executeAt);
    }

    /**
     * Control vibration
     */
    vibrate(pattern: number[], repeat?: number, toAll = false, executeAt?: number): void {
        this.sendAudienceControl(toAll, 'vibrate', { pattern, repeat }, executeAt);
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
        this.sendAudienceControl(toAll, 'modulateSound', { ...options }, executeAt);
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
        this.sendAudienceControl(toAll, 'modulateSoundUpdate', { ...options }, executeAt);
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

        this.sendAudienceControl(toAll, 'screenColor', normalized, executeAt);
    }

    /**
     * Play sound on clients
     */
    playSound(url: string, options?: { volume?: number; loop?: boolean }, toAll = false, executeAt?: number): void {
        this.sendAudienceControl(toAll, 'playSound', { url, ...options }, executeAt);
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
        this.sendAudienceControl(toAll, 'playMedia', { url, ...options }, executeAt);
    }

    /**
     * Stop all media on clients
     */
    stopMedia(toAll = false): void {
        this.sendAudienceControl(toAll, 'stopMedia', {});
    }

    stopSound(toAll = false): void {
        this.sendAudienceControl(toAll, 'stopSound', {});
    }

    /**
     * Show image on clients
     */
    showImage(url: string, options?: { duration?: number }, toAll = false, executeAt?: number): void {
        this.sendAudienceControl(toAll, 'showImage', { url, ...options }, executeAt);
    }

    /**
     * Hide image on clients
     */
    hideImage(toAll = false): void {
        this.sendAudienceControl(toAll, 'hideImage', {});
    }

    /**
     * Set the ordered visual scene layer list.
     */
    setVisualScenes(scenes: VisualSceneLayerItem[], toAll = false, executeAt?: number): void {
        this.sendAudienceControl(toAll, 'visualScenes', { scenes }, executeAt);
    }

    private sendAudienceControl(toAll: boolean, action: ControlAction, payload: ControlPayload, executeAt?: number): void {
        sendControlByAudience(
            this.sendControlToAll.bind(this),
            this.sendControlToSelected.bind(this),
            toAll,
            action,
            payload,
            executeAt
        );
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
                    this.updateState(createStateSnapshotPatch({
                        clients: message.payload.clients,
                        stateStrategy: message.payload.stateStrategy,
                        controlPlane: message.payload.controlPlane,
                    }));
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
