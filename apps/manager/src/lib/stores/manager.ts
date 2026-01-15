/**
 * Manager store - wraps the SDK and provides reactive state for Svelte
 */
import { writable, derived, get } from 'svelte/store';
import { ManagerSDK, type ManagerState, type ManagerSDKConfig } from '@shugu/sdk-manager';
import type {
    SensorDataMessage,
    ScreenColorPayload,
    ControlAction,
    ControlPayload,
    TargetSelector,
    VisualSceneLayerItem,
} from '@shugu/protocol';
import { targetClients } from '@shugu/protocol';

import { parameterRegistry } from '../parameters/registry';
import { registerDefaultControlParameters } from '../parameters/presets';
import {
    displayBridgeNodeMedia,
    displayBridgeState,
    sendControl as sendLocalDisplayControl,
    sendPlugin as sendLocalDisplayPlugin,
} from '$lib/display/display-bridge';
import { createDisplayTransport } from '$lib/display/display-transport';

const SEND_TO_DISPLAY_STORAGE_KEY = 'shugu-send-to-display';

// SDK instance
let sdk: ManagerSDK | null = null;

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

export type NodeMediaSignal = {
    nodeType?: string;
    lastClientId?: string;
    startedSeq?: number;
    endedSeq?: number;
    startedAt?: number;
    endedAt?: number;
};

// Node-level media signals emitted by clients (e.g. load-audio/video-from-assets actual start).
export const nodeMediaSignals = writable<Map<string, NodeMediaSignal>>(new Map());

export type ClientReadinessStatus =
    | 'connected' // connected but not verified assets yet (yellow)
    | 'assets-loading' // actively preloading (yellow)
    | 'assets-ready' // preload complete (green)
    | 'assets-error'; // preload failed (red)

export type ClientReadiness = {
    status: ClientReadinessStatus;
    manifestId?: string;
    loaded?: number;
    total?: number;
    error?: string;
    updatedAt: number;
};

// Per-client readiness (drives "client dot" UI state).
export const clientReadiness = writable<Map<string, ClientReadiness>>(new Map());

export type ClientToneReadiness = {
    enabled: boolean | null;
    error?: string;
    updatedAt: number;
};

// Per-client Tone readiness (drives audio gating in show mode).
export const clientToneReadiness = writable<Map<string, ClientToneReadiness>>(new Map());

export type ClientScreenshotUpload = {
    dataUrl: string;
    mime?: string;
    width?: number;
    height?: number;
    createdAt?: number;
    updatedAt: number;
};

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
        const next = new Map(prev);
        const current = next.get(nodeId) ?? ({} as NodeMediaSignal);
        const startedSeq = typeof current.startedSeq === 'number' ? current.startedSeq : 0;
        const endedSeq = typeof current.endedSeq === 'number' ? current.endedSeq : 0;
        const patch: NodeMediaSignal = {
            ...current,
            nodeType: nodeType ?? current.nodeType,
            lastClientId: LOCAL_DISPLAY_CLIENT_ID,
        };
        if (type === 'started') {
            patch.startedSeq = startedSeq + 1;
            patch.startedAt = at;
        }
        if (type === 'ended') {
            patch.endedSeq = endedSeq + 1;
            patch.endedAt = at;
        }
        next.set(nodeId, patch);
        return next;
    });
});

/**
 * Initialize and connect to server
 */
export function connect(config: ManagerSDKConfig): void {
    if (sdk) {
        sdk.disconnect();
    }
    nodeMediaSignals.set(new Map());

    // Seed registry-based control parameters early so MIDI/AutoUI/Project restore can see them.
    registerDefaultControlParameters();

    sdk = new ManagerSDK(config);

    // Subscribe to state changes
    sdk.onStateChange((newState) => {
        state.set(newState);
        const ids = new Set((newState.clients ?? []).map((c) => c.clientId));
        const now = Date.now();

        clientReadiness.update((prev) => {
            const next = new Map(prev);

            // Remove vanished clients
            for (const id of next.keys()) {
                if (!ids.has(id)) next.delete(id);
            }

            // Mark new clients as connected (yellow) until they report assets-ready.
            for (const id of ids) {
                if (!next.has(id)) {
                    next.set(id, { status: 'connected', updatedAt: now });
                }
            }

            return next;
        });

        clientToneReadiness.update((prev) => {
            const next = new Map(prev);
            for (const id of next.keys()) {
                if (!ids.has(id)) next.delete(id);
            }
            for (const id of ids) {
                if (!next.has(id)) {
                    next.set(id, { enabled: null, updatedAt: now });
                }
            }
            return next;
        });

        clientScreenshotUploads.update((prev) => {
            const next = new Map(prev);
            for (const id of next.keys()) {
                if (!ids.has(id)) next.delete(id);
            }
            return next;
        });

        sensorData.update((prev) => {
            const next = new Map(prev);
            for (const id of next.keys()) {
                if (!ids.has(id)) next.delete(id);
            }
            return next;
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
                    const mime = typeof payload.mime === 'string' ? payload.mime : undefined;
                    const width =
                        typeof payload.width === 'number' && Number.isFinite(payload.width)
                            ? payload.width
                            : undefined;
                    const height =
                        typeof payload.height === 'number' && Number.isFinite(payload.height)
                            ? payload.height
                            : undefined;
                    const createdAt =
                        typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
                            ? payload.createdAt
                            : undefined;

                    if (import.meta.env.DEV) {
                        console.info('[Manager] client-screenshot received', {
                            clientId: data.clientId,
                            mime,
                            width,
                            height,
                            createdAt,
                            dataUrlChars: dataUrl.length,
                        });
                    }

                    const now = Date.now();
                    clientScreenshotUploads.update((prev) => {
                        const next = new Map(prev);
                        next.set(data.clientId, {
                            dataUrl,
                            mime,
                            width,
                            height,
                            createdAt,
                            updatedAt: now,
                        });
                        return next;
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
                const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : null;
                const error = payload.error ? String(payload.error) : undefined;
                const now = Date.now();

                clientToneReadiness.update((prev) => {
                    const next = new Map(prev);
                    const current = next.get(data.clientId) ?? { enabled: null, updatedAt: now };
                    next.set(data.clientId, { ...current, enabled, error, updatedAt: now });
                    return next;
                });
            }

            if (payload?.kind === 'node-media') {
                const event = typeof payload.event === 'string' ? payload.event : '';
                const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : '';
                const nodeType = typeof payload.nodeType === 'string' ? payload.nodeType : undefined;
                if (nodeId && (event === 'started' || event === 'ended')) {
                    const at = Date.now();
                    nodeMediaSignals.update((prev) => {
                        const next = new Map(prev);
                        const current = next.get(nodeId) ?? ({} as NodeMediaSignal);
                        const startedSeq = typeof current.startedSeq === 'number' ? current.startedSeq : 0;
                        const endedSeq = typeof current.endedSeq === 'number' ? current.endedSeq : 0;
                        const patch: NodeMediaSignal = {
                            ...current,
                            nodeType: nodeType ?? current.nodeType,
                            lastClientId: data.clientId,
                        };
                        if (event === 'started') {
                            patch.startedSeq = startedSeq + 1;
                            patch.startedAt = at;
                        }
                        if (event === 'ended') {
                            patch.endedSeq = endedSeq + 1;
                            patch.endedAt = at;
                        }
                        next.set(nodeId, patch);
                        return next;
                    });
                }
            }

            if (payload?.kind === 'multimedia-core' && payload?.event === 'asset-preload') {
                const status = typeof payload.status === 'string' ? payload.status : '';
                const manifestId = typeof payload.manifestId === 'string' ? payload.manifestId : undefined;
                const loaded = typeof payload.loaded === 'number' && Number.isFinite(payload.loaded) ? payload.loaded : undefined;
                const total = typeof payload.total === 'number' && Number.isFinite(payload.total) ? payload.total : undefined;
                const error = payload.error ? String(payload.error) : undefined;
                const now = Date.now();

                clientReadiness.update((prev) => {
                    const next = new Map(prev);
                    const current = next.get(data.clientId) ?? { status: 'connected' as const, updatedAt: now };

                    if (status === 'loading') {
                        next.set(data.clientId, { ...current, status: 'assets-loading', manifestId, loaded, total, updatedAt: now });
                        return next;
                    }

                    if (status === 'ready') {
                        next.set(data.clientId, { ...current, status: 'assets-ready', manifestId, loaded: total ?? loaded, total, updatedAt: now });
                        return next;
                    }

                    if (status === 'error') {
                        next.set(data.clientId, { ...current, status: 'assets-error', manifestId, error, updatedAt: now });
                        return next;
                    }

                    return next;
                });
            }

            if (payload?.kind === 'display' && payload?.event === 'ready') {
                const manifestId = typeof payload.manifestId === 'string' ? payload.manifestId : undefined;
                const at = Date.now();

                clientReadiness.update((prev) => {
                    const next = new Map(prev);
                    const current = next.get(data.clientId) ?? { status: 'connected' as const, updatedAt: at };
                    next.set(data.clientId, { ...current, status: 'assets-ready', manifestId, updatedAt: at });
                    return next;
                });
            }
        }
    });

    sdk.connect();
}

/**
 * Disconnect from server
 */
export function disconnect(): void {
    sdk?.disconnect();
    sdk = null;
    sensorData.set(new Map());
    clientReadiness.set(new Map());
    clientToneReadiness.set(new Map());
    clientScreenshotUploads.set(new Map());
    nodeMediaSignals.set(new Map());
    parameterRegistry.clear();
}

/**
 * Select clients by ID
 */
export function selectClients(clientIds: string[]): void {
    const audienceIdSet = new Set(get(audienceClients).map((c) => c.clientId));
    sdk?.selectClients(clientIds.filter((id) => audienceIdSet.has(id)));
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
    sdk?.clearSelection();
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
    return action === 'showImage' || action === 'hideImage' || action === 'playMedia' || action === 'stopMedia' || action === 'screenColor';
}

function maybeMirrorToDisplay(action: ControlAction, payload: ControlPayload, executeAt?: number): void {
    if (!get(sendToDisplayEnabled)) return;
    if (!shouldMirrorToDisplay(action)) return;
    displayTransport.sendControl(action, payload, executeAt);
}

// Control actions
export function flashlight(mode: 'off' | 'on' | 'blink', options?: { frequency?: number; dutyCycle?: number }, toAll = false, executeAt?: number): void {
    sdk?.flashlight(mode, options, toAll, executeAt);
}

export function vibrate(pattern: number[], repeat?: number, toAll = false, executeAt?: number): void {
    sdk?.vibrate(pattern, repeat, toAll, executeAt);
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
    sdk?.modulateSound(options, toAll, executeAt);
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
    sdk?.modulateSoundUpdate(options, toAll, executeAt);
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
    if (target && sdk) {
        sdk.sendControl(target, 'screenColor', payload, executeAt);
    }
    maybeMirrorToDisplay('screenColor', payload, executeAt);
}

export function playSound(url: string, options?: { volume?: number; loop?: boolean }, toAll = false, executeAt?: number): void {
    sdk?.playSound(url, options, toAll, executeAt);
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
    if (target && sdk) {
        sdk.sendControl(target, 'playMedia', payload, executeAt);
    }
    maybeMirrorToDisplay('playMedia', payload, executeAt);
}

export function stopMedia(toAll = false): void {
    const target = resolveAudienceTarget(toAll);
    if (target && sdk) {
        sdk.sendControl(target, 'stopMedia', {});
    }
    maybeMirrorToDisplay('stopMedia', {}, undefined);
}

export function stopSound(toAll = false): void {
    sdk?.stopSound(toAll);
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
    if (target && sdk) {
        sdk.sendControl(target, 'showImage', payload, executeAt);
    }
    maybeMirrorToDisplay('showImage', payload, executeAt);
}

export function hideImage(toAll = false): void {
    const target = resolveAudienceTarget(toAll);
    if (target && sdk) {
        sdk.sendControl(target, 'hideImage', {});
    }
    maybeMirrorToDisplay('hideImage', {}, undefined);
}

export function setVisualScenes(scenes: VisualSceneLayerItem[], toAll = false, executeAt?: number): void {
    sdk?.setVisualScenes(scenes, toAll, executeAt);
}

export function sendPluginControl(
    pluginId: string,
    command: 'init' | 'start' | 'stop' | 'configure',
    payload?: Record<string, unknown>,
    toAll = false
): void {
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
    return sdk;
}
