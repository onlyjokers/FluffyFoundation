import { Injectable } from '@nestjs/common';
import type { ClientInfo, ConnectionRole } from '@shugu/protocol';

interface ConnectionInfo {
    socketId: string;
    clientId: string;
    role: ConnectionRole;
    connectedAt: number;
    lastSeenAt: number;
    disconnectedAt?: number;
    userAgent?: string;
    group?: string;
    selected: boolean;
    connected: boolean;
    deviceId?: string;
    instanceId?: string;
}

type ClientIdentity = { deviceId?: string; instanceId?: string; clientId?: string };

@Injectable()
export class ClientRegistryService {
    private clients: Map<string, ConnectionInfo> = new Map();
    private managers: Map<string, ConnectionInfo> = new Map();
    private socketToClientId: Map<string, string> = new Map();
    private clientIdCounter = 0;
    private graceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private readonly gracePeriodMs = (() => {
        const raw = Number(process.env.SHUGU_CLIENT_GRACE_MS);
        return Number.isFinite(raw) ? Math.max(0, raw) : 5000;
    })();
    private clientExpiredHandlers: Set<(clientId: string) => void> = new Set();

    onClientExpired(handler: (clientId: string) => void): () => void {
        this.clientExpiredHandlers.add(handler);
        return () => this.clientExpiredHandlers.delete(handler);
    }

    /**
     * Generate unique client ID
     */
    private generateClientId(): string {
        this.clientIdCounter++;
        const timestamp = Date.now().toString(36);
        const counter = this.clientIdCounter.toString(36).padStart(4, '0');
        return `c_${timestamp}_${counter}`;
    }

    /**
     * Generate manager ID
     */
    private generateManagerId(): string {
        const timestamp = Date.now().toString(36);
        return `m_${timestamp}`;
    }

    private clearGraceTimer(clientId: string): void {
        const timer = this.graceTimers.get(clientId);
        if (timer) {
            clearTimeout(timer);
            this.graceTimers.delete(clientId);
        }
    }

    private scheduleGracePurge(clientId: string): void {
        if (this.gracePeriodMs <= 0) {
            this.purgeClient(clientId);
            return;
        }

        this.clearGraceTimer(clientId);
        const timer = setTimeout(() => {
            const info = this.clients.get(clientId);
            if (!info || info.connected) return;
            this.purgeClient(clientId);
        }, this.gracePeriodMs);
        this.graceTimers.set(clientId, timer);
    }

    private purgeClient(clientId: string): void {
        if (!this.clients.has(clientId)) return;
        this.clients.delete(clientId);
        this.graceTimers.delete(clientId);
        this.clientExpiredHandlers.forEach((handler) => {
            try {
                handler(clientId);
            } catch (err) {
                console.error('[Registry] clientExpired handler failed:', err);
            }
        });
        console.log(`[Registry] client expired: ${clientId}`);
    }

    /**
     * Register a new connection
     */
    registerConnection(
        socketId: string,
        role: ConnectionRole,
        userAgent?: string,
        identity?: ClientIdentity,
    ): { clientId: string; replacedSocketId?: string; isNewClient?: boolean } {
        const now = Date.now();
        let replacedSocketId: string | undefined;

        if (role === 'client') {
            const deviceId = this.sanitizeId(identity?.deviceId);
            const instanceId = this.sanitizeId(identity?.instanceId);
            const requestedClientId = this.sanitizeId(identity?.clientId);

            if (deviceId) {
                const desiredClientId = requestedClientId ?? deviceId;
                const existing = this.clients.get(desiredClientId);

                if (existing) {
                    // Same tab/session: take over the existing stable clientId to avoid duplicates.
                    if (instanceId && existing.instanceId === instanceId) {
                        replacedSocketId = existing.socketId !== socketId ? existing.socketId : undefined;
                        if (replacedSocketId) {
                            this.socketToClientId.delete(replacedSocketId);
                        }

                        existing.socketId = socketId;
                        existing.connectedAt = now;
                        existing.lastSeenAt = now;
                        existing.disconnectedAt = undefined;
                        existing.userAgent = userAgent;
                        existing.deviceId = deviceId;
                        existing.instanceId = instanceId;
                        existing.connected = true;
                        this.clearGraceTimer(desiredClientId);

                        this.socketToClientId.set(socketId, desiredClientId);

                        console.log(`[Registry] client reconnected: ${desiredClientId} (socket: ${socketId})`);
                        return { clientId: desiredClientId, replacedSocketId, isNewClient: false };
                    }

                    // Another tab/device tries to use the same desired id: allocate a new suffix.
                    const allocated = this.allocateClientId(deviceId);
                    const info: ConnectionInfo = {
                        socketId,
                        clientId: allocated,
                        role,
                        connectedAt: now,
                        lastSeenAt: now,
                        userAgent,
                        selected: false,
                        connected: true,
                        deviceId,
                        instanceId: instanceId ?? undefined,
                    };
                    this.clients.set(allocated, info);
                    this.socketToClientId.set(socketId, allocated);
                    console.log(`[Registry] client registered: ${allocated} (socket: ${socketId})`);
                    return { clientId: allocated, isNewClient: true };
                }

                // Desired id is free, use it as-is.
                const info: ConnectionInfo = {
                    socketId,
                    clientId: desiredClientId,
                    role,
                    connectedAt: now,
                    lastSeenAt: now,
                    userAgent,
                    selected: false,
                    connected: true,
                    deviceId,
                    instanceId: instanceId ?? undefined,
                };
                this.clients.set(desiredClientId, info);
                this.socketToClientId.set(socketId, desiredClientId);
                console.log(`[Registry] client registered: ${desiredClientId} (socket: ${socketId})`);
                return { clientId: desiredClientId, isNewClient: true };
            }

            // No usable identity provided; fall back to generated id.
            const clientId = this.generateClientId();
            const info: ConnectionInfo = {
                socketId,
                clientId,
                role,
                connectedAt: now,
                lastSeenAt: now,
                userAgent,
                selected: false,
                connected: true,
            };
            this.clients.set(clientId, info);
            this.socketToClientId.set(socketId, clientId);
            console.log(`[Registry] client registered: ${clientId} (socket: ${socketId})`);
            return { clientId, isNewClient: true };
        }

        // Managers: keep existing behavior (server-generated ids).
        const managerId = this.generateManagerId();
        const managerInfo: ConnectionInfo = {
            socketId,
            clientId: managerId,
            role,
            connectedAt: now,
            lastSeenAt: now,
            userAgent,
            selected: false,
            connected: true,
        };
        this.managers.set(managerId, managerInfo);
        this.socketToClientId.set(socketId, managerId);

        console.log(`[Registry] ${role} registered: ${managerId} (socket: ${socketId})`);
        return { clientId: managerId, isNewClient: true };
    }

    private sanitizeId(value: unknown): string | null {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const limited = trimmed.slice(0, 80);
        const sanitized = limited.replace(/[^a-zA-Z0-9_-]/g, '_');
        return sanitized || null;
    }

    private allocateClientId(baseId: string): string {
        if (!this.isClientIdInUse(baseId)) return baseId;
        for (let suffix = 1; suffix < 10_000; suffix++) {
            const candidate = `${baseId}_${suffix}`;
            if (!this.isClientIdInUse(candidate)) return candidate;
        }
        // Last resort: fall back to a generated ID.
        return this.generateClientId();
    }

    private isClientIdInUse(clientId: string): boolean {
        return this.clients.has(clientId) || this.managers.has(clientId);
    }

    /**
     * Unregister a connection by socket ID
     */
    unregisterBySocketId(socketId: string): ConnectionInfo | null {
        const clientId = this.socketToClientId.get(socketId);
        if (!clientId) return null;

        this.socketToClientId.delete(socketId);

        const clientInfo = this.clients.get(clientId);
        if (clientInfo) {
            clientInfo.connected = false;
            clientInfo.disconnectedAt = Date.now();
            clientInfo.lastSeenAt = clientInfo.disconnectedAt;
            this.scheduleGracePurge(clientId);
            console.log(
                `[Registry] client disconnected: ${clientId} (grace ${this.gracePeriodMs}ms)`
            );
            return clientInfo;
        }

        const managerInfo = this.managers.get(clientId);
        if (managerInfo) {
            this.managers.delete(clientId);
            console.log(`[Registry] manager disconnected: ${clientId}`);
            return managerInfo;
        }

        return null;
    }

    /**
     * Get client info by client ID
     */
    getClient(clientId: string): ConnectionInfo | undefined {
        return this.clients.get(clientId);
    }

    /**
     * Get socket ID by client ID
     */
    getSocketId(clientId: string): string | undefined {
        const client = this.clients.get(clientId);
        if (client && client.connected) return client.socketId;
        const manager = this.managers.get(clientId);
        if (manager && manager.connected) return manager.socketId;
        return undefined;
    }

    /**
     * Get client ID by socket ID
     */
    getClientIdBySocketId(socketId: string): string | undefined {
        return this.socketToClientId.get(socketId);
    }

    /**
     * Check if socket is a manager
     */
    isManager(socketId: string): boolean {
        const clientId = this.socketToClientId.get(socketId);
        if (!clientId) return false;
        return this.managers.has(clientId);
    }

    /**
     * Get all connections for a list of client IDs
     */
    getSocketIds(clientIds: string[]): string[] {
        return clientIds
            .map(id => this.getSocketId(id))
            .filter((id): id is string => id !== undefined);
    }

    /**
     * Get all client socket IDs
     */
    getAllClientSocketIds(): string[] {
        return Array.from(this.clients.values())
            .filter(c => c.connected)
            .map(c => c.socketId);
    }

    /**
     * Get all manager socket IDs
     */
    getAllManagerSocketIds(): string[] {
        return Array.from(this.managers.values())
            .filter(m => m.connected)
            .map(m => m.socketId);
    }

    /**
     * Get all clients as ClientInfo array
     */
    getAllClients(): ClientInfo[] {
        return Array.from(this.clients.values()).map(c => ({
            clientId: c.clientId,
            connectedAt: c.connectedAt,
            lastSeenAt: c.lastSeenAt,
            userAgent: c.userAgent,
            group: c.group,
            selected: c.selected,
            connected: c.connected,
        }));
    }

    /**
     * Get all managers
     */
    getAllManagers(): { clientId: string; connectedAt: number }[] {
        return Array.from(this.managers.values()).map(m => ({
            clientId: m.clientId,
            connectedAt: m.connectedAt,
        }));
    }

    /**
     * Get client count
     */
    getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Get manager count
     */
    getManagerCount(): number {
        return this.managers.size;
    }

    /**
     * Set client group
     */
    setClientGroup(clientId: string, group: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.group = group;
        }
    }

    /**
     * Set client selected state
     */
    setClientSelected(clientId: string, selected: boolean): void {
        const client = this.clients.get(clientId);
        if (client && client.selected !== selected) {
            client.selected = selected;
        }
    }

    /**
     * Get clients by group
     */
    getClientsByGroup(groupId: string): ConnectionInfo[] {
        return Array.from(this.clients.values()).filter(c => c.group === groupId && c.connected);
    }

    /**
     * Get selected clients
     */
    getSelectedClients(): ConnectionInfo[] {
        return Array.from(this.clients.values()).filter(c => c.selected);
    }
}
