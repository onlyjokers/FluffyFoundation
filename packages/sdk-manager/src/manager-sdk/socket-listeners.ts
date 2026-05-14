/**
 * Purpose: Socket.io event wiring and message handling for Manager SDK.
 */
import {
    SOCKET_EVENTS,
    createTimePing,
    isSensorDataMessage,
    isSystemMessage,
    processTimePong,
    updateTimeSyncState,
    type Message,
    type SensorDataMessage,
    type SystemMessage,
    type TimePongData,
} from '@shugu/protocol';
import type { Socket } from 'socket.io-client';
import { createStateSnapshotPatch } from '../state-snapshot.js';
import type { ManagerState, MessageHandler } from './types.js';

export type ManagerSocketListenerHost = {
    getSocket(): Socket | null;
    getState(): ManagerState;
    getAutoReconnect(): boolean;
    getTimeSyncInterval(): number;
    setTimeSyncIntervalId(id: ReturnType<typeof setInterval> | null): void;
    getTimeSyncIntervalId(): ReturnType<typeof setInterval> | null;
    updateState(partial: Partial<ManagerState>): void;
    getSensorDataHandlers(): Set<MessageHandler<SensorDataMessage>>;
};

export function setupManagerSocketListeners(host: ManagerSocketListenerHost): void {
    const socket = host.getSocket();
    if (!socket) return;

    socket.on('connect', () => {
        console.log('[SDK Manager] Connected');
        host.updateState({ status: 'connected', error: null });
        startTimeSync(host);
    });

    socket.on('disconnect', (reason) => {
        console.log('[SDK Manager] Disconnected:', reason);
        stopTimeSync(host);

        // socket.io does not auto-reconnect if the server explicitly disconnected us.
        if (host.getAutoReconnect() && reason !== 'io client disconnect') {
            host.updateState({ status: 'reconnecting', managerId: null });

            if (reason === 'io server disconnect') {
                host.getSocket()?.connect();
            }
            return;
        }

        host.updateState({ status: 'disconnected', managerId: null });
    });

    socket.on('connect_error', (error) => {
        console.error('[SDK Manager] Connection error:', error.message);
        host.updateState({ status: 'error', error: error.message });
    });

    socket.io.on('reconnect_attempt', () => {
        host.updateState({ status: 'reconnecting' });
    });

    socket.io.on('reconnect', () => {
        console.log('[SDK Manager] Reconnected');
        host.updateState({ status: 'connected', error: null });
    });

    socket.on(SOCKET_EVENTS.MSG, (message: Message) => {
        handleManagerMessage(host, message);
    });

    socket.on(SOCKET_EVENTS.TIME_PONG, (data: TimePongData) => {
        const result = processTimePong(data);
        const newTimeSync = updateTimeSyncState(host.getState().timeSync, result);
        host.updateState({ timeSync: newTimeSync });
    });
}

export function handleManagerMessage(host: ManagerSocketListenerHost, message: Message): void {
    if (isSensorDataMessage(message)) {
        host.getSensorDataHandlers().forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                console.error('[SDK Manager] Sensor data handler error:', error);
            }
        });
    } else if (isSystemMessage(message)) {
        handleManagerSystemMessage(host, message as SystemMessage);
    }
}

export function handleManagerSystemMessage(
    host: ManagerSocketListenerHost,
    message: SystemMessage
): void {
    switch (message.action) {
        case 'clientRegistered':
            if (message.payload.clientId) {
                host.updateState({ managerId: message.payload.clientId });
                console.log('[SDK Manager] Registered as:', message.payload.clientId);
            }
            break;
        case 'clientList':
            if (message.payload.clients) {
                host.updateState(createStateSnapshotPatch({
                    clients: message.payload.clients,
                    stateStrategy: message.payload.stateStrategy,
                    controlPlane: message.payload.controlPlane,
                }));
            }
            break;
        case 'clientJoined':
            console.log('[SDK Manager] Client joined:', message.payload.clientId);
            applyClientJoined(host, message);
            break;
        case 'clientLeft': {
            console.log('[SDK Manager] Client left:', message.payload.clientId);
            applyClientLeft(host, message);
            break;
        }
    }
}

function applyClientJoined(host: ManagerSocketListenerHost, message: SystemMessage): void {
    const clientId = message.payload.clientId?.trim();
    if (!clientId) return;

    const state = host.getState();
    const existing = state.clients.find((client) => client.clientId === clientId);
    const connectedAt = typeof message.serverTimestamp === 'number' ? message.serverTimestamp : Date.now();

    const clients = existing
        ? state.clients.map((client) =>
            client.clientId === clientId
                ? {
                    ...client,
                    connected: true,
                    lastSeenAt: connectedAt,
                }
                : client
        )
        : [
            ...state.clients,
            {
                clientId,
                connectedAt,
                connected: true,
                selected: false,
            },
        ];

    host.updateState({ clients });
}

function applyClientLeft(host: ManagerSocketListenerHost, message: SystemMessage): void {
    const clientId = message.payload.clientId?.trim();
    if (!clientId) return;

    const state = host.getState();
    const remainingSelectedClientIds = state.selectedClientIds.filter((id) => id !== clientId);
    const remainingClients = state.clients.filter((client) => client.clientId !== clientId);

    const patch: Partial<ManagerState> = {};
    if (remainingClients.length !== state.clients.length) patch.clients = remainingClients;
    if (remainingSelectedClientIds.length !== state.selectedClientIds.length) {
        patch.selectedClientIds = remainingSelectedClientIds;
    }

    if (Object.keys(patch).length > 0) host.updateState(patch);
}

export function startTimeSync(host: ManagerSocketListenerHost): void {
    doTimeSync(host);
    host.setTimeSyncIntervalId(setInterval(() => {
        doTimeSync(host);
    }, host.getTimeSyncInterval()));
}

export function stopTimeSync(host: ManagerSocketListenerHost): void {
    const intervalId = host.getTimeSyncIntervalId();
    if (intervalId) {
        clearInterval(intervalId);
        host.setTimeSyncIntervalId(null);
    }
}

function doTimeSync(host: ManagerSocketListenerHost): void {
    const socket = host.getSocket();
    if (!socket?.connected) return;
    socket.emit(SOCKET_EVENTS.TIME_PING, createTimePing());
}
