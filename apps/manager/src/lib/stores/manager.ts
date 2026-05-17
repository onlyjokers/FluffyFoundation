/**
 * Manager store - wraps the SDK and provides reactive state for Svelte
 */
import { writable, derived, get } from 'svelte/store';
import { ManagerSDK, type ManagerState, type ManagerSDKConfig } from '@shugu/sdk-manager';
import type { SemanticGraphSnapshot } from '@shugu/node-core';
import type {
    SensorDataMessage,
    ScreenColorPayload,
    ControlAction,
    ControlPayload,
    TargetSelector,
    VisualSceneLayerItem,
} from '@shugu/protocol';
import { targetClients } from '@shugu/protocol';

import { nodeEngine } from '$lib/nodes/engine';
import { parameterRegistry } from '../parameters/registry';
import { registerDefaultControlParameters } from '../parameters/presets';
import { readLocalProjectForServerMigration } from '$lib/project/projectManager';
import { readNodeGraphLayoutPositions } from '$lib/project/nodeGraphLayout';
import { replaceCustomNodeDefinitions } from '$lib/nodes/custom-nodes/store';
import { nodeGroupsState } from '$lib/project/nodeGraphUiState';
import {
    bindServerSemanticSync,
    createServerSemanticMigrationCoordinator,
    type LocalProjectForServerMigration,
} from '$lib/semantic/server-semantic-sync';
import {
    displayBridgeNodeMedia,
    displayBridgeState,
    sendControl as sendLocalDisplayControl,
    sendPlugin as sendLocalDisplayPlugin,
} from '$lib/display/display-bridge';
import { createDisplayTransport } from '$lib/display/display-transport';
import { getManagerSDK, setManagerSDK } from './manager-sdk-access';
import {
    applyAiReadinessPayload,
    applyClientPresence,
    applyClientScreenshotPayload,
    applyNodeMediaEvent,
    applyReadinessPayload,
    applyToneReadinessPayload,
    removeVanishedClients,
    type ClientAiReadiness,
    type ClientReadiness,
    type ClientReadinessStatus,
    type ClientScreenshotUpload,
    type ClientToneReadiness,
    type NodeMediaSignal,
} from './manager-sensor-events';

const SEND_TO_DISPLAY_STORAGE_KEY = 'shugu-send-to-display';

// Core state store
export const state = writable<ManagerState>({
    status: 'disconnected',
    managerId: null,
    clients: [],
    selectedClientIds: [],
    timeSync: {
        offset: 0,
        samples: [],
        maxSamples: 10,
        initialized: false,
        lastSyncTime: 0,
    },
    error: null,
});

export const displayTransport = createDisplayTransport({
    managerState: state,
    displayBridgeState,
    getSDK,
    local: {
        sendControl: sendLocalDisplayControl,
        sendPlugin: sendLocalDisplayPlugin,
    },
});

// Sensor data store (latest data from each client)
export const sensorData = writable<Map<string, SensorDataMessage>>(new Map());

export type {
    ClientAiReadiness,
    ClientReadiness,
    ClientReadinessStatus,
    ClientScreenshotUpload,
    ClientToneReadiness,
    NodeMediaSignal,
} from './manager-sensor-events';

// Node-level media signals emitted by clients (e.g. load-audio/video-from-assets actual start).
export const nodeMediaSignals = writable<Map<string, NodeMediaSignal>>(new Map());

// Per-client readiness (drives "client dot" UI state).
export const clientReadiness = writable<Map<string, ClientReadiness>>(new Map());

// Per-client Tone readiness (drives audio gating in show mode).
export const clientToneReadiness = writable<Map<string, ClientToneReadiness>>(new Map());

export const clientAiReadiness = writable<Map<string, ClientAiReadiness>>(new Map());

export const semanticSnapshot = writable<SemanticGraphSnapshot | null>(null);

// Per-client uploaded screenshots (drives `client-object.imageOut`).
export const clientScreenshotUploads = writable<Map<string, ClientScreenshotUpload>>(new Map());

// Derived stores
export const connectionStatus = derived(state, ($state) => $state.status);
export const clients = derived(state, ($state) => $state.clients);
export const displayClients = derived(clients, ($clients) => $clients.filter((c) => c.group === 'display'));
export const audienceClients = derived(clients, ($clients) => $clients.filter((c) => c.group !== 'display'));
export const selectedClients = derived(state, ($state) =>
    $state.clients.filter(c => $state.selectedClientIds.includes(c.clientId))
);
export const timeOffset = derived(state, ($state) => $state.timeSync.offset);
export const serverTime = derived(state, ($state) =>
    Date.now() + $state.timeSync.offset
);

export const sendToDisplayEnabled = writable(false);

// Select-all mode: keep all audience clients selected (including newly joined ones).
export const selectAllClientsEnabled = writable(false);

const LOCAL_DISPLAY_CLIENT_ID = 'local:display';

if (typeof window !== 'undefined') {
    try {
        sendToDisplayEnabled.set(window.localStorage.getItem(SEND_TO_DISPLAY_STORAGE_KEY) === '1');
    } catch {
        // ignore
    }

    let lastSendToDisplayEnabled: boolean | null = null;
    sendToDisplayEnabled.subscribe((enabled) => {
        // When disconnecting from Display mirroring, clear any long-lived effects so Display doesn't stay stuck.
        if (lastSendToDisplayEnabled === true && !enabled) {
            displayTransport.sendControl('stopMedia', {}, undefined);
            displayTransport.sendControl('hideImage', {}, undefined);
            const clearScreen: ScreenColorPayload = { color: '#000000', opacity: 0, mode: 'solid' };
            displayTransport.sendControl('screenColor', clearScreen, undefined);
        }
        lastSendToDisplayEnabled = enabled;

        try {
            window.localStorage.setItem(SEND_TO_DISPLAY_STORAGE_KEY, enabled ? '1' : '0');
        } catch {
            // ignore
        }
    });
}

let selectAllSyncScheduled = false;
let selectAllSyncTargetIds: string[] | null = null;

function scheduleSelectAllSync(clientIds: string[]): void {
    selectAllSyncTargetIds = clientIds;
    if (selectAllSyncScheduled) return;
    selectAllSyncScheduled = true;

    Promise.resolve().then(() => {
        selectAllSyncScheduled = false;
        if (!get(selectAllClientsEnabled)) return;
        const sdk = getManagerSDK();
        if (!sdk) return;
        const ids = selectAllSyncTargetIds ?? [];
        selectAllSyncTargetIds = null;
        sdk.selectClients(ids);
    });
}

function maybeSyncSelectAll(newState: ManagerState): void {
    if (!get(selectAllClientsEnabled)) return;

    const audienceIds = (newState.clients ?? [])
        .filter((c) => c.group !== 'display')
        .map((c) => String(c.clientId ?? ''))
        .filter(Boolean);

    const audienceIdSet = new Set(audienceIds);
    const selectedIds = (newState.selectedClientIds ?? []).map(String).filter(Boolean);
    const selectedIdSet = new Set(selectedIds);

    const missingAudience = audienceIds.some((id) => !selectedIdSet.has(id));
    const hasNonAudience = selectedIds.some((id) => !audienceIdSet.has(id));
    if (missingAudience || hasNonAudience) {
        scheduleSelectAllSync(audienceIds);
    }
}

// Local Display (MessagePort) can emit node-media started/ended signals. Mirror these into `nodeMediaSignals`
// so time-range playheads advance even when the Display isn't server-connected.
displayBridgeNodeMedia.subscribe((event) => {
    if (!event) return;
    const nodeId = typeof event.nodeId === 'string' ? event.nodeId.trim() : '';
    if (!nodeId) return;
    const type = event.event;
    if (type !== 'started' && type !== 'ended') return;

    const at = typeof event.at === 'number' && Number.isFinite(event.at) ? event.at : Date.now();
    const nodeType = typeof event.nodeType === 'string' ? event.nodeType : undefined;

    nodeMediaSignals.update((prev) => {
        return applyNodeMediaEvent(prev, {
            clientId: LOCAL_DISPLAY_CLIENT_ID,
            event: type,
            nodeId,
            nodeType,
            at,
        });
    });
});

/**
 * Initialize and connect to server
 */
export function connect(config: ManagerSDKConfig): void {
    const existingSdk = getManagerSDK();
    if (existingSdk) {
        existingSdk.disconnect();
    }
    nodeMediaSignals.set(new Map());

    // Seed registry-based control parameters early so MIDI/AutoUI/Project restore can see them.
    registerDefaultControlParameters();

    const sdk = new ManagerSDK(config);
    setManagerSDK(sdk);

    const migrationCoordinator = createServerSemanticMigrationCoordinator({
        storage: typeof window === 'undefined' ? null : window.localStorage,
        readLocalProject: () => readLocalProjectForServerMigration() as LocalProjectForServerMigration | null,
        sendSemanticCommand: (input) => sdk.sendSemanticCommand(input),
    });

    bindServerSemanticSync({
        sdk,
        nodeEngine,
        migrationCoordinator,
        setNodeGroups: (groups) => nodeGroupsState.set(groups),
        setCustomNodeDefinitions: replaceCustomNodeDefinitions,
        getLayoutPositions: readNodeGraphLayoutPositions,
        onSnapshot: (snapshot) => semanticSnapshot.set(snapshot),
    });

    // Subscribe to state changes
    sdk.onStateChange((newState) => {
        state.set(newState);
        const ids = (newState.clients ?? []).map((c) => c.clientId);
        const now = Date.now();

        clientReadiness.update((prev) => {
            return applyClientPresence(prev, ids, () => ({ status: 'connected', updatedAt: now }), now);
        });

        clientToneReadiness.update((prev) => {
            return applyClientPresence(prev, ids, () => ({ enabled: null, updatedAt: now }), now);
        });

        clientAiReadiness.update((prev) => {
            return applyClientPresence(prev, ids, () => ({ enabled: null, updatedAt: now }), now);
        });

        clientScreenshotUploads.update((prev) => {
            return removeVanishedClients(prev, ids);
        });

        sensorData.update((prev) => {
            return removeVanishedClients(prev, ids);
        });

        maybeSyncSelectAll(newState);
    });

    // Subscribe to sensor data
    sdk.onSensorData((data) => {
        // Screenshot uploads are large; keep them out of `sensorData` so they don't overwrite
        // the latest motion/mic/executor messages.
        if (data.sensorType === 'custom') {
            const payload = (data.payload ?? {}) as Record<string, unknown>;
            if (payload?.kind === 'client-screenshot') {
                const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
                if (dataUrl) {
                    if (import.meta.env.DEV) {
                        console.info('[Manager] client-screenshot received', {
                            clientId: data.clientId,
                            mime: payload.mime,
                            width: payload.width,
                            height: payload.height,
                            createdAt: payload.createdAt,
                            dataUrlChars: dataUrl.length,
                        });
                    }

                    const now = Date.now();
                    clientScreenshotUploads.update((prev) => {
                        return applyClientScreenshotPayload(prev, data.clientId, payload, now) ?? prev;
                    });
                    return;
                }
            }
        }

        sensorData.update(map => {
            map.set(data.clientId, data);
            return new Map(map);
        });

        // Parse multimedia-core readiness events (custom sensor channel).
        if (data.sensorType === 'custom') {
            const payload = (data.payload ?? {}) as Record<string, unknown>;

            if (payload?.kind === 'tone' && payload?.event === 'ready') {
                const now = Date.now();
                clientToneReadiness.update((prev) => applyToneReadinessPayload(prev, data.clientId, payload, now) ?? prev);
            }

            if (payload?.kind === 'node-executor' && payload?.event === 'ai') {
                const now = Date.now();
                clientAiReadiness.update((prev) => applyAiReadinessPayload(prev, data.clientId, payload, now) ?? prev);
            }

            if (payload?.kind === 'node-media') {
                const event = typeof payload.event === 'string' ? payload.event : '';
                const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : '';
                const nodeType = typeof payload.nodeType === 'string' ? payload.nodeType : undefined;
                if (nodeId && (event === 'started' || event === 'ended')) {
                    const at = Date.now();
                    nodeMediaSignals.update((prev) => {
                        return applyNodeMediaEvent(prev, {
                            clientId: data.clientId,
                            event,
                            nodeId,
                            nodeType,
                            at,
                        });
                    });
                }
            }

            if (payload?.kind === 'multimedia-core' && payload?.event === 'asset-preload') {
                const now = Date.now();
                clientReadiness.update((prev) => applyReadinessPayload(prev, data.clientId, payload, now));
            }

            if (payload?.kind === 'display' && payload?.event === 'ready') {
                const at = Date.now();
                clientReadiness.update((prev) => applyReadinessPayload(prev, data.clientId, payload, at));
            }
        }
    });

    sdk.connect();
}

/**
 * Disconnect from server
 */
export function disconnect(): void {
    getManagerSDK()?.disconnect();
    setManagerSDK(null);
    sensorData.set(new Map());
    clientReadiness.set(new Map());
    clientToneReadiness.set(new Map());
    clientAiReadiness.set(new Map());
    clientScreenshotUploads.set(new Map());
    nodeMediaSignals.set(new Map());
    parameterRegistry.clear();
}

/**
 * Select clients by ID
 */
export function selectClients(clientIds: string[]): void {
    const audienceIdSet = new Set(get(audienceClients).map((c) => c.clientId));
    getManagerSDK()?.selectClients(clientIds.filter((id) => audienceIdSet.has(id)));
}

export function setSelectAllClients(enabled: boolean): void {
    selectAllClientsEnabled.set(enabled);
    if (enabled) {
        selectClients(get(audienceClients).map((c) => c.clientId));
    }
}

export function toggleSelectAllClients(): void {
    setSelectAllClients(!get(selectAllClientsEnabled));
}

/**
 * Toggle client selection
 */
export function toggleClientSelection(clientId: string): void {
    selectAllClientsEnabled.set(false);
    const currentState = get(state);
    const isSelected = currentState.selectedClientIds.includes(clientId);

    if (isSelected) {
        selectClients(currentState.selectedClientIds.filter(id => id !== clientId));
    } else {
        selectClients([...currentState.selectedClientIds, clientId]);
    }
}

/**
 * Select all clients
 */
export function selectAllClients(): void {
    setSelectAllClients(true);
}

/**
 * Clear all selection
 */
export function clearSelection(): void {
    selectAllClientsEnabled.set(false);
    getManagerSDK()?.clearSelection();
}

function resolveAudienceTarget(toAll: boolean): TargetSelector | null {
    const currentState = get(state);
    const audienceIdSet = new Set(currentState.clients.filter((c) => c.group !== 'display').map((c) => c.clientId));

    const ids = toAll
        ? Array.from(audienceIdSet)
        : currentState.selectedClientIds.filter((id) => audienceIdSet.has(id));

    if (ids.length === 0) return null;
    return targetClients(ids);
}

function shouldMirrorToDisplay(action: ControlAction): boolean {
    return action === 'showImage' || action === 'hideImage' || action === 'showText' || action === 'hideText' || action === 'playMedia' || action === 'stopMedia' || action === 'screenColor';
}

function maybeMirrorToDisplay(action: ControlAction, payload: ControlPayload, executeAt?: number): void {
    if (!get(sendToDisplayEnabled)) return;
    if (!shouldMirrorToDisplay(action)) return;
    displayTransport.sendControl(action, payload, executeAt);
}

// Control actions
export function flashlight(mode: 'off' | 'on' | 'blink', options?: { frequency?: number; dutyCycle?: number }, toAll = false, executeAt?: number): void {
    getManagerSDK()?.flashlight(mode, options, toAll, executeAt);
}

export function vibrate(pattern: number[], repeat?: number, toAll = false, executeAt?: number): void {
    getManagerSDK()?.vibrate(pattern, repeat, toAll, executeAt);
}

export function modulateSound(
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
    getManagerSDK()?.modulateSound(options, toAll, executeAt);
}

export function modulateSoundUpdate(
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
    getManagerSDK()?.modulateSoundUpdate(options, toAll, executeAt);
}

export function screenColor(
    colorOrPayload: string | ScreenColorPayload,
    opacity?: number,
    toAll = false,
    executeAt?: number
): void {
    const payload: ScreenColorPayload = typeof colorOrPayload === 'string'
        ? { color: colorOrPayload, opacity, mode: 'solid' }
        : colorOrPayload;

    const target = resolveAudienceTarget(toAll);
    const sdk = getManagerSDK();
    if (target && sdk) {
        sdk.sendControl(target, 'screenColor', payload, executeAt);
    }
    maybeMirrorToDisplay('screenColor', payload, executeAt);
}

export function playSound(url: string, options?: { volume?: number; loop?: boolean }, toAll = false, executeAt?: number): void {
    getManagerSDK()?.playSound(url, options, toAll, executeAt);
}

export function playMedia(
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
    const target = resolveAudienceTarget(toAll);
    const sdk = getManagerSDK();
    if (target && sdk) {
        sdk.sendControl(target, 'playMedia', payload, executeAt);
    }
    maybeMirrorToDisplay('playMedia', payload, executeAt);
}

export function stopMedia(toAll = false): void {
    const target = resolveAudienceTarget(toAll);
    const sdk = getManagerSDK();
    if (target && sdk) {
        sdk.sendControl(target, 'stopMedia', {});
    }
    maybeMirrorToDisplay('stopMedia', {}, undefined);
}

export function stopSound(toAll = false): void {
    getManagerSDK()?.stopSound(toAll);
}

export function interruptMedia(toAll = false): void {
    // Stop video/audio/media streams and hide images
    stopMedia(toAll);
    stopSound(toAll);
    hideImage(toAll);
}

export function showImage(
    url: string,
    options?: { duration?: number },
    toAll = false,
    executeAt?: number
): void {
    const payload = { url, ...options };
    const target = resolveAudienceTarget(toAll);
    const sdk = getManagerSDK();
    if (target && sdk) {
        sdk.sendControl(target, 'showImage', payload, executeAt);
    }
    maybeMirrorToDisplay('showImage', payload, executeAt);
}

export function hideImage(toAll = false): void {
    const target = resolveAudienceTarget(toAll);
    const sdk = getManagerSDK();
    if (target && sdk) {
        sdk.sendControl(target, 'hideImage', {});
    }
    maybeMirrorToDisplay('hideImage', {}, undefined);
}

export function setVisualScenes(scenes: VisualSceneLayerItem[], toAll = false, executeAt?: number): void {
    getManagerSDK()?.setVisualScenes(scenes, toAll, executeAt);
}

export function sendPluginControl(
    pluginId: string,
    command: 'init' | 'start' | 'stop' | 'configure',
    payload?: Record<string, unknown>,
    toAll = false
): void {
    const sdk = getManagerSDK();
    if (!sdk) return;
    const currentState = get(state);
    const target = toAll
        ? { mode: 'all' as const }
        : { mode: 'clientIds' as const, ids: currentState.selectedClientIds };
    sdk.sendPluginControl(target, pluginId, command, payload);
}

/**
 * Get SDK instance (for advanced usage)
 */
export function getSDK(): ManagerSDK | null {
    return getManagerSDK();
}
