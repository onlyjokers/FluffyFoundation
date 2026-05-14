/**
 * Purpose: Normalize Manager SDK connection configuration.
 */
import type { ManagerSDKConfig, SocketTransport } from './types.js';

export type NormalizedManagerSDKConfig = Required<Omit<ManagerSDKConfig, 'commandEnvelope'>> &
    Pick<ManagerSDKConfig, 'commandEnvelope'>;

export function normalizeManagerSDKConfig(config: ManagerSDKConfig): NormalizedManagerSDKConfig {
    const transports: SocketTransport[] = (() => {
        const defaults: SocketTransport[] = ['polling', 'websocket'];
        const raw = Array.isArray(config.transports) ? config.transports : defaults;
        const normalized = raw.filter((t): t is SocketTransport => t === 'polling' || t === 'websocket');
        const unique = Array.from(new Set(normalized));
        return unique.length > 0 ? unique : defaults;
    })();

    return {
        serverUrl: config.serverUrl,
        autoReconnect: config.autoReconnect ?? true,
        // Default to unlimited retries to keep the control UI resilient.
        reconnectionAttempts: config.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
        reconnectionDelay: config.reconnectionDelay ?? 1000,
        timeSyncInterval: config.timeSyncInterval ?? 5000,
        transports,
        // Throttle high-frequency updates to ~30fps by default to prevent backpressure.
        highFreqThrottleMs: config.highFreqThrottleMs ?? 33,
        managerKey: typeof config.managerKey === 'string' ? config.managerKey.trim() : '',
        commandEnvelope: config.commandEnvelope,
    };
}
