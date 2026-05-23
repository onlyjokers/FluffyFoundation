// Purpose: Pure client presence and sensor-event reducers for the manager store.

export type NodeMediaSignal = {
    nodeType?: string;
    lastClientId?: string;
    startedSeq?: number;
    endedSeq?: number;
    startedAt?: number;
    endedAt?: number;
};

export type ClientReadinessStatus =
    | 'connected'
    | 'assets-loading'
    | 'assets-ready'
    | 'assets-error';

export type ClientReadiness = {
    status: ClientReadinessStatus;
    manifestId?: string;
    loaded?: number;
    total?: number;
    error?: string;
    updatedAt: number;
};

export type ClientToneReadiness = {
    enabled: boolean | null;
    error?: string;
    updatedAt: number;
};

export type ClientAiReadiness = {
    enabled: boolean | null;
    error?: string;
    updatedAt: number;
};

export type ClientScreenshotUpload = {
    dataUrl: string;
    mime?: string;
    width?: number;
    height?: number;
    createdAt?: number;
    updatedAt: number;
};

export type ClientUiInteractionState = {
    clientId: string;
    kind: 'button' | 'input';
    pressed: boolean;
    inputContent: string;
    firstInputed: boolean;
    updatedAt: number;
};

export function applyClientPresence<T>(
    prev: Map<string, T>,
    clientIds: Iterable<string>,
    createInitial: (clientId: string, now: number) => T,
    now: number
): Map<string, T> {
    const ids = new Set(Array.from(clientIds).map(String).filter(Boolean));
    const next = new Map(prev);
    for (const id of next.keys()) {
        if (!ids.has(id)) next.delete(id);
    }
    for (const id of ids) {
        if (!next.has(id)) next.set(id, createInitial(id, now));
    }
    return next;
}

export function removeVanishedClients<T>(
    prev: Map<string, T>,
    clientIds: Iterable<string>
): Map<string, T> {
    const ids = new Set(Array.from(clientIds).map(String).filter(Boolean));
    const next = new Map(prev);
    for (const id of next.keys()) {
        if (!ids.has(id)) next.delete(id);
    }
    return next;
}

export function applyClientScreenshotPayload(
    prev: Map<string, ClientScreenshotUpload>,
    clientId: string,
    payload: Record<string, unknown>,
    now: number
): Map<string, ClientScreenshotUpload> | null {
    if (payload?.kind !== 'client-screenshot') return null;
    const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
    if (!dataUrl) return null;

    const mime = typeof payload.mime === 'string' ? payload.mime : undefined;
    const width =
        typeof payload.width === 'number' && Number.isFinite(payload.width) ? payload.width : undefined;
    const height =
        typeof payload.height === 'number' && Number.isFinite(payload.height) ? payload.height : undefined;
    const createdAt =
        typeof payload.createdAt === 'number' && Number.isFinite(payload.createdAt)
            ? payload.createdAt
            : undefined;

    const next = new Map(prev);
    next.set(clientId, { dataUrl, mime, width, height, createdAt, updatedAt: now });
    return next;
}

export function applyClientUiInteractionPayload(
    prev: Map<string, ClientUiInteractionState>,
    clientId: string,
    payload: Record<string, unknown>,
    now: number
): Map<string, ClientUiInteractionState> {
    if (payload?.kind !== 'client-ui-interaction') return prev;
    const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId.trim() : '';
    if (!nodeId) return prev;

    const rawKind = typeof payload.uiKind === 'string' ? payload.uiKind : '';
    const kind = rawKind === 'button' || rawKind === 'input' ? rawKind : null;
    if (!kind) return prev;

    const current = prev.get(nodeId);
    const next = new Map(prev);
    next.set(nodeId, {
        clientId,
        kind,
        pressed: Boolean(payload.pressed),
        inputContent:
            typeof payload.inputContent === 'string'
                ? payload.inputContent
                : current?.inputContent ?? '',
        firstInputed: Boolean(payload.firstInputed ?? current?.firstInputed ?? false),
        updatedAt: now,
    });
    return next;
}

export function applyNodeMediaEvent(
    prev: Map<string, NodeMediaSignal>,
    input: {
        clientId: string;
        event: string;
        nodeId: string;
        nodeType?: string;
        at: number;
    }
): Map<string, NodeMediaSignal> {
    if (!input.nodeId || (input.event !== 'started' && input.event !== 'ended')) return prev;

    const next = new Map(prev);
    const current = next.get(input.nodeId) ?? ({} as NodeMediaSignal);
    const startedSeq = typeof current.startedSeq === 'number' ? current.startedSeq : 0;
    const endedSeq = typeof current.endedSeq === 'number' ? current.endedSeq : 0;
    const patch: NodeMediaSignal = {
        ...current,
        nodeType: input.nodeType ?? current.nodeType,
        lastClientId: input.clientId,
    };
    if (input.event === 'started') {
        patch.startedSeq = startedSeq + 1;
        patch.startedAt = input.at;
    }
    if (input.event === 'ended') {
        patch.endedSeq = endedSeq + 1;
        patch.endedAt = input.at;
    }
    next.set(input.nodeId, patch);
    return next;
}

export function applyToneReadinessPayload(
    prev: Map<string, ClientToneReadiness>,
    clientId: string,
    payload: Record<string, unknown>,
    now: number
): Map<string, ClientToneReadiness> | null {
    if (payload?.kind !== 'tone' || payload?.event !== 'ready') return null;
    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : null;
    const error = payload.error ? String(payload.error) : undefined;
    const next = new Map(prev);
    const current = next.get(clientId) ?? { enabled: null, updatedAt: now };
    next.set(clientId, { ...current, enabled, error, updatedAt: now });
    return next;
}

export function applyAiReadinessPayload(
    prev: Map<string, ClientAiReadiness>,
    clientId: string,
    payload: Record<string, unknown>,
    now: number
): Map<string, ClientAiReadiness> | null {
    if (payload?.kind !== 'node-executor' || payload?.event !== 'ai') return null;
    const status = typeof payload.status === 'string' ? payload.status : '';
    const enabled = status === 'enabled' ? true : status === 'disabled' ? false : null;
    const error = payload.error ? String(payload.error) : undefined;
    const next = new Map(prev);
    const current = next.get(clientId) ?? { enabled: null, updatedAt: now };
    next.set(clientId, { ...current, enabled, error, updatedAt: now });
    return next;
}

export function applyReadinessPayload(
    prev: Map<string, ClientReadiness>,
    clientId: string,
    payload: Record<string, unknown>,
    now: number
): Map<string, ClientReadiness> {
    if (payload?.kind === 'display' && payload?.event === 'ready') {
        const manifestId = typeof payload.manifestId === 'string' ? payload.manifestId : undefined;
        const next = new Map(prev);
        const current = next.get(clientId) ?? { status: 'connected' as const, updatedAt: now };
        next.set(clientId, { ...current, status: 'assets-ready', manifestId, updatedAt: now });
        return next;
    }

    if (payload?.kind !== 'multimedia-core' || payload?.event !== 'asset-preload') return prev;

    const status = typeof payload.status === 'string' ? payload.status : '';
    const manifestId = typeof payload.manifestId === 'string' ? payload.manifestId : undefined;
    const loaded =
        typeof payload.loaded === 'number' && Number.isFinite(payload.loaded) ? payload.loaded : undefined;
    const total =
        typeof payload.total === 'number' && Number.isFinite(payload.total) ? payload.total : undefined;
    const error = payload.error ? String(payload.error) : undefined;

    const next = new Map(prev);
    const current = next.get(clientId) ?? { status: 'connected' as const, updatedAt: now };
    if (status === 'loading') {
        next.set(clientId, { ...current, status: 'assets-loading', manifestId, loaded, total, updatedAt: now });
    } else if (status === 'ready') {
        next.set(clientId, { ...current, status: 'assets-ready', manifestId, loaded: total ?? loaded, total, updatedAt: now });
    } else if (status === 'error') {
        next.set(clientId, { ...current, status: 'assets-error', manifestId, error, updatedAt: now });
    }
    return next;
}
