import { io, Socket } from 'socket.io-client';
import {
    SensorDataMessage,
    MediaMetaMessage,
    SOCKET_EVENTS,
    createPluginControlMessage,
    createSemanticMessage,
    createSemanticResultMessage,
    createMediaMetaMessage,
    getServerTime,
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
    type SemanticCommandPayload,
    type SemanticMessage,
    type SemanticResultMessage,
    type SemanticTargetSelector,
    type SemanticWarning,
} from '@shugu/protocol';
import {
    nextManagerCommandEnvelope,
    nextManagerCommandEnvelopeForTarget,
    normalizeManagerCommandEnvelope,
    type CommandEnvelope,
} from './command-envelope.js';
import { sendControlByAudience } from './controls.js';
import { ManagerDeliveryQueue } from './delivery-queue.js';
import { normalizeManagerSDKConfig, type NormalizedManagerSDKConfig } from './manager-sdk/config.js';
import {
    setupManagerSocketListeners,
    handleManagerSystemMessage,
    stopTimeSync,
    type ManagerSocketListenerHost,
} from './manager-sdk/socket-listeners.js';
import { createInitialManagerState, notifyManagerStateListeners } from './manager-sdk/state.js';
import type { BooleanVariablesHandler, ManagerSDKConfig, ManagerState, MessageHandler, SemanticSnapshotHandler } from './manager-sdk/types.js';
export type {
    ConnectionStatus,
    ManagerSDKConfig,
    ManagerState,
    MessageHandler,
    SocketTransport,
} from './manager-sdk/types.js';

const isControlBatchPayload = (payload: ControlPayload): payload is ControlBatchPayload =>
    typeof payload === 'object' && payload !== null && 'kind' in payload && (payload as ControlBatchPayload).kind === 'control-batch';

/**
 * Manager SDK for managing Socket.io connection and controlling clients
 */
export class ManagerSDK {
    private socket: Socket | null = null;
    private config: NormalizedManagerSDKConfig;
    private state: ManagerState;
    private commandEnvelope: CommandEnvelope;
    private stateListeners: Set<(state: ManagerState) => void> = new Set();
    private sensorDataHandlers: Set<MessageHandler<SensorDataMessage>> = new Set();
    private semanticCommandHandlers: Set<MessageHandler<SemanticMessage>> = new Set();
    private semanticResultHandlers: Set<MessageHandler<SemanticResultMessage>> = new Set();
    private semanticSnapshotHandlers: Set<SemanticSnapshotHandler> = new Set();
    private booleanVariablesHandlers: Set<BooleanVariablesHandler> = new Set();
    private timeSyncIntervalId: ReturnType<typeof setInterval> | null = null;
    private readonly deliveryQueue: ManagerDeliveryQueue;

    constructor(config: ManagerSDKConfig) {
        this.config = normalizeManagerSDKConfig(config);
        this.commandEnvelope = normalizeManagerCommandEnvelope(this.config.commandEnvelope);
        this.deliveryQueue = new ManagerDeliveryQueue({
            getSocket: () => this.socket,
            getClientCount: () => this.state.clients.length,
            getThrottleMs: () => this.config.highFreqThrottleMs,
            nextCommandEnvelope: (target) => this.nextCommandEnvelope(target),
        });

        this.state = createInitialManagerState();
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
            withCredentials: true,
            ...(typeof this.config.rejectUnauthorized === 'boolean'
                ? { rejectUnauthorized: this.config.rejectUnauthorized }
                : {}),
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

        setupManagerSocketListeners(this.createSocketListenerHost());
    }

    /**
     * Disconnect from server
     */
    disconnect(): void {
        stopTimeSync(this.createSocketListenerHost());
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
     * Subscribe to live semantic graph commands routed to this Manager.
     */
    onSemanticCommand(handler: MessageHandler<SemanticMessage>): () => void {
        this.semanticCommandHandlers.add(handler);
        return () => this.semanticCommandHandlers.delete(handler);
    }

    /**
     * Subscribe to semantic command results.
     */
    onSemanticResult(handler: MessageHandler<SemanticResultMessage>): () => void {
        this.semanticResultHandlers.add(handler);
        return () => this.semanticResultHandlers.delete(handler);
    }

    /**
     * Subscribe to server-owned semantic graph snapshots.
     */
    onSemanticSnapshot(handler: SemanticSnapshotHandler): () => void {
        this.semanticSnapshotHandlers.add(handler);
        return () => this.semanticSnapshotHandlers.delete(handler);
    }

    onBooleanVariables(handler: BooleanVariablesHandler): () => void {
        this.booleanVariablesHandlers.add(handler);
        return () => this.booleanVariablesHandlers.delete(handler);
    }

    sendBooleanVariableUpdates(updates: Record<string, boolean>): void {
        this.socket?.emit(SOCKET_EVENTS.MSG, {
            type: 'system' as const,
            version: 1 as const,
            action: 'booleanVariables.update' as const,
            payload: { updates: { ...updates } },
            clientTimestamp: Date.now(),
        });
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

    /**
     * Send a live semantic graph command to the Manager graph runtime.
     */
    sendSemanticCommand(input: {
        target?: SemanticTargetSelector;
        command: SemanticCommandPayload;
        dryRun?: boolean;
        requestId: string;
    }): boolean {
        if (!this.socket?.connected) return false;
        const message = createSemanticMessage({
            target: input.target ?? { mode: 'server' },
            actor: this.commandEnvelope.actor,
            role: this.commandEnvelope.role === 'system' ? 'system' : 'manager',
            command: input.command,
            ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
            requestId: input.requestId,
        });
        this.socket.emit(SOCKET_EVENTS.MSG, message);
        return true;
    }

    /**
     * Request the current server-owned semantic graph snapshot.
     */
    requestSemanticSnapshot(requestId = 'graph-snapshot'): void {
        this.sendSemanticCommand({
            target: { mode: 'server' },
            command: { kind: 'graph.snapshot' },
            requestId,
        });
    }

    /**
     * Send a semantic command result back through the live manager channel.
     */
    sendSemanticResult(
        input:
            | {
                  requestId: string;
                  ok: true;
                  result: Record<string, unknown>;
                  warnings?: SemanticWarning[];
                  snapshotRevision?: number;
              }
            | {
                  requestId: string;
                  ok: false;
                  error: SemanticResultMessage['error'];
                  warnings?: SemanticWarning[];
                  snapshotRevision?: number;
              }
    ): void {
        if (!this.socket?.connected) return;
        this.socket.emit(SOCKET_EVENTS.MSG, createSemanticResultMessage(input));
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

    private updateState(partial: Partial<ManagerState>): void {
        this.state = { ...this.state, ...partial };
        notifyManagerStateListeners(this.state, this.stateListeners);
    }

    private handleSystemMessage(message: import('@shugu/protocol').SystemMessage): void {
        handleManagerSystemMessage(this.createSocketListenerHost(), message);
    }

    private createSocketListenerHost(): ManagerSocketListenerHost {
        return {
            getSocket: () => this.socket,
            getState: () => this.getState(),
            getAutoReconnect: () => this.config.autoReconnect,
            getTimeSyncInterval: () => this.config.timeSyncInterval,
            setTimeSyncIntervalId: (id) => {
                this.timeSyncIntervalId = id;
            },
            getTimeSyncIntervalId: () => this.timeSyncIntervalId,
            updateState: (partial) => this.updateState(partial),
            getSensorDataHandlers: () => this.sensorDataHandlers,
            getSemanticCommandHandlers: () => this.semanticCommandHandlers,
            getSemanticResultHandlers: () => this.semanticResultHandlers,
            getSemanticSnapshotHandlers: () => this.semanticSnapshotHandlers,
            getBooleanVariablesHandlers: () => this.booleanVariablesHandlers,
        };
    }
}
