import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { ClientRegistryService } from '../client-registry/client-registry.service.js';
import { createStateStrategyConfigFromEnv, createStateStrategyStatus } from '../bootstrap/state-strategy.js';
import { createControlPlaneSnapshot } from '../bootstrap/control-plane-snapshot.js';
import type {
    ControlMessage,
    SensorDataMessage,
    MediaMetaMessage,
    PluginControlMessage,
    SystemMessage,
    Message,
    MessageWithoutServerTimestamp,
    TargetSelector,
    DeliveryMetrics,
} from '@shugu/protocol';
import { addServerTimestamp, classifyDelivery, createDeliveryMetrics } from '@shugu/protocol';

@Injectable()
export class MessageRouterService {
    private server: Server | null = null;

    // Rate limiting for high-frequency broadcasts
    private lastBroadcastTime: Map<string, number> = new Map();
    private readonly minBroadcastIntervalMs = 22; // ~45fps max
    private pendingLatestStateByKey: Map<
        string,
        { message: ControlMessage; dueAt: number; timeoutId: ReturnType<typeof setTimeout> | null }
    > = new Map();
    private readonly deliveryMetrics: DeliveryMetrics = createDeliveryMetrics();

    constructor(private readonly clientRegistry: ClientRegistryService) { }

    /**
     * Set Socket.io server instance
     */
    setServer(server: Server): void {
        this.server = server;
    }

    getDeliveryMetrics(): DeliveryMetrics {
        return { ...this.deliveryMetrics };
    }

    /**
     * Route a message based on its type and target
     */
    routeMessage(message: MessageWithoutServerTimestamp, _fromSocketId: string): void {
        if (!this.server) {
            console.error('[Router] Server not initialized');
            return;
        }

        // Add server timestamp to all messages
        const timestampedMessage = addServerTimestamp(message, Date.now()) as Message;

        switch (message.type) {
            case 'control':
                this.routeControlMessage(timestampedMessage as ControlMessage);
                break;
            case 'data':
                this.routeSensorDataMessage(timestampedMessage as SensorDataMessage);
                break;
            case 'media':
                this.routeMediaMessage(timestampedMessage as MediaMetaMessage);
                break;
            case 'plugin':
                this.routePluginMessage(timestampedMessage as PluginControlMessage);
                break;
            case 'system':
                this.routeSystemMessage(timestampedMessage as SystemMessage, _fromSocketId);
                break;
        }
    }

    /**
     * Route control message from manager to clients
     * Uses volatile emit for high-frequency updates to prevent buffer buildup
     */
    private routeControlMessage(message: ControlMessage): void {
        const socketIds = this.resolveTargetSocketIds(message.target, 'client');
        if (socketIds.length === 0) {
            this.deliveryMetrics.rejected += 1;
            return;
        }

        const delivery = classifyDelivery(message);

        if (delivery.deliveryClass === 'latest-state-control' && delivery.latestStateKey && socketIds.length > 50) {
            const now = Date.now();
            const lastTime = this.lastBroadcastTime.get(delivery.latestStateKey) ?? 0;
            if (now - lastTime < this.minBroadcastIntervalMs) {
                this.queueLatestStateReplay(
                    delivery.latestStateKey,
                    message,
                    lastTime + this.minBroadcastIntervalMs
                );
                this.deliveryMetrics.coalesced += 1;
                return;
            }
            this.lastBroadcastTime.set(delivery.latestStateKey, now);
        }

        if (delivery.deliveryClass === 'volatile-telemetry') {
            this.emitVolatile(socketIds, message);
        } else {
            this.emitToSockets(socketIds, message);
        }

        this.flushDueLatestState();
    }

    /**
     * Route sensor data from client to managers
     * Filter out high-frequency sensor data to reduce Redis/network overhead.
     * Keep important system messages like Push Image uploads and readiness signals.
     */
    private routeSensorDataMessage(message: SensorDataMessage): void {
        const sensorType = message.sensorType;
        
        // Block high-frequency sensor data that causes network congestion
        // Allowed types: 'gyro' | 'accel' | 'orientation' | 'mic' | 'camera' | 'custom'
        if (sensorType === 'mic' || sensorType === 'gyro' || sensorType === 'accel' || sensorType === 'orientation') {
            this.deliveryMetrics.dropped += 1;
            return;
        }
        
        // For 'custom' sensor type, allow only important system messages
        if (sensorType === 'custom') {
            const payload = message.payload as Record<string, unknown> | undefined;
            const kind = payload?.kind;
            
            // Allowlist: only these custom kinds are forwarded
            const allowedKinds = [
                'client-screenshot',    // Push Image upload - MUST keep
                'multimedia-core',      // Asset preload status
                'tone',                 // Tone.js readiness
                'node-media',           // Media playback events
                'node-executor',        // NodeExecutor status (deploy/stop/errors)
                'display',              // Display readiness
            ];
            
            if (typeof kind !== 'string' || !allowedKinds.includes(kind)) {
                this.deliveryMetrics.rejected += 1;
                return;
            }
        }
        
        // Forward allowed sensor data to managers
        const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();
        this.emitToSockets(managerSocketIds, message);
    }

    /**
     * Route media message from manager to clients
     */
    private routeMediaMessage(message: MediaMetaMessage): void {
        const socketIds = this.resolveTargetSocketIds(message.target, 'client');
        // console.log(`[Router] Media message -> ${socketIds.length} clients`);
        this.emitToSockets(socketIds, message);
    }

    /**
     * Route plugin control message from manager to clients
     */
    private routePluginMessage(message: PluginControlMessage): void {
        const socketIds = this.resolveTargetSocketIds(message.target, 'client');
       //  console.log(`[Router] Plugin message "${message.pluginId}:${message.command}" -> ${socketIds.length} clients`);
        this.emitToSockets(socketIds, message);
    }

    /**
     * Route system message
     */
    private routeSystemMessage(_message: SystemMessage, _fromSocketId: string): void {
        // System messages are typically handled by the gateway directly
        // console.log(`[Router] System message: ${message.action}`);
    }

    /**
     * Resolve target selector to socket IDs
     */
    private resolveTargetSocketIds(target: TargetSelector, roleFilter: 'client' | 'manager'): string[] {
        switch (target.mode) {
            case 'all':
                return roleFilter === 'client'
                    ? this.clientRegistry.getAllClientSocketIds()
                    : this.clientRegistry.getAllManagerSocketIds();

            case 'clientIds':
                return this.clientRegistry.getSocketIds(target.ids);

            case 'group': {
                const clients = this.clientRegistry.getClientsByGroup(target.groupId);
                return clients.map(c => c.socketId);
            }

            default:
                return [];
        }
    }

    /**
     * Broadcast client list update to all managers
     */
    broadcastClientListUpdate(): void {
        if (!this.server) return;

        const clients = this.clientRegistry.getAllClients();
        const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();

        const message: SystemMessage = addServerTimestamp({
            type: 'system',
            version: 1,
            action: 'clientList',
            payload: {
                clients,
                stateStrategy: createStateStrategyStatus(createStateStrategyConfigFromEnv()),
                controlPlane: createControlPlaneSnapshot(
                    clients,
                    this.clientRegistry.getAllGroupOwnershipEntries()
                ),
            },
        }, Date.now());

        this.emitToSockets(managerSocketIds, message);
    }

    /**
     * Notify managers of client join
     */
    notifyClientJoined(clientId: string): void {
        if (!this.server) return;

        const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();
        const message: SystemMessage = addServerTimestamp({
            type: 'system',
            version: 1,
            action: 'clientJoined',
            payload: { clientId },
        }, Date.now());

        this.emitToSockets(managerSocketIds, message);

        // Also send full client list
        this.broadcastClientListUpdate();
    }

    /**
     * Notify managers of client leave
     */
    notifyClientLeft(clientId: string): void {
        if (!this.server) return;

        const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();
        const message: SystemMessage = addServerTimestamp({
            type: 'system',
            version: 1,
            action: 'clientLeft',
            payload: { clientId },
        }, Date.now());

        this.emitToSockets(managerSocketIds, message);

        // Also send full client list
        this.broadcastClientListUpdate();
    }

    /**
     * Send registration confirmation to a client
     */
    sendRegistrationConfirmation(socketId: string, clientId: string): void {
        if (!this.server) return;

        const message: SystemMessage = addServerTimestamp({
            type: 'system',
            version: 1,
            action: 'clientRegistered',
            payload: { clientId },
        }, Date.now());

        this.server.to(socketId).emit('msg', message);
    }

    private emitToSockets(socketIds: string[], message: Message): void {
        if (!this.server) return;
        if (socketIds.length === 0) return;
        // Note: this still sends one packet per connection, but avoids per-socket JS loop jitter.
        this.server.to(socketIds).emit('msg', message);
        this.deliveryMetrics.delivered += 1;
    }

    /**
     * Emit with volatile flag - message will be dropped if socket buffer is full.
     * Use for high-frequency updates where missing a frame is acceptable (e.g., MIDI-driven modulation).
     * This prevents backpressure buildup when broadcasting to many clients.
     */
    private emitVolatile(socketIds: string[], message: Message): void {
        if (!this.server) return;
        if (socketIds.length === 0) return;
        this.server.volatile.to(socketIds).emit('msg', message);
        this.deliveryMetrics.delivered += 1;
    }

    private flushDueLatestState(forceKey?: string): void {
        for (const [key, entry] of Array.from(this.pendingLatestStateByKey.entries())) {
            if (key !== forceKey && Date.now() < entry.dueAt) continue;
            if (entry.timeoutId) clearTimeout(entry.timeoutId);
            this.flushLatestStateEntry(key, entry);
        }
    }

    private queueLatestStateReplay(latestStateKey: string, message: ControlMessage, dueAt: number): void {
        const previous = this.pendingLatestStateByKey.get(latestStateKey);
        if (previous?.timeoutId) clearTimeout(previous.timeoutId);
        const delayMs = Math.max(0, dueAt - Date.now());
        const timeoutId = setTimeout(() => {
            const entry = this.pendingLatestStateByKey.get(latestStateKey);
            if (!entry) return;
            this.flushLatestStateEntry(latestStateKey, entry);
        }, delayMs);
        this.pendingLatestStateByKey.set(latestStateKey, { message, dueAt, timeoutId });
    }

    private flushLatestStateEntry(
        key: string,
        entry: { message: ControlMessage; dueAt: number; timeoutId: ReturnType<typeof setTimeout> | null }
    ): void {
        const { message, dueAt } = entry;
        const socketIds = this.resolveTargetSocketIds(message.target, 'client');
        if (socketIds.length === 0) {
            this.deliveryMetrics.rejected += 1;
            this.pendingLatestStateByKey.delete(key);
            return;
        }
        const deliveredAt = Date.now();
        if (deliveredAt > dueAt + this.minBroadcastIntervalMs) this.deliveryMetrics.late += 1;
        this.emitToSockets(socketIds, message);
        this.lastBroadcastTime.set(key, deliveredAt);
        this.pendingLatestStateByKey.delete(key);
    }
}
