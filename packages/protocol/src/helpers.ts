import {
    BaseMessage,
    ControlMessage,
    SensorDataMessage,
    MediaMetaMessage,
    PluginControlMessage,
    SystemMessage,
    Message,
    MessageWithoutServerTimestamp,
    PROTOCOL_VERSION,
    TargetSelector,
    ControlAction,
    ControlPayload,
    SensorType,
    SensorPayload,
    MediaType,
    PluginId,
    PluginCommand,
    SystemAction,
    type NonSystemControlMessage,
    type NonSystemMediaMetaMessage,
    type NonSystemPluginControlMessage,
} from './types.js';
import {
    createCommandEnvelope,
    createSystemCommandEnvelope,
    type CommandEnvelopeInput,
} from './command-envelope.js';
import { validateMessage } from './validation.js';
export { matchesTarget } from './helpers/matches-target.js';
export { createCommandEnvelope } from './command-envelope.js';
export { createPolicyRejectReason, validateMessage } from './validation.js';

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
    return Date.now();
}

/**
 * Create a control message
 */
export function createControlMessage(
    envelope: CommandEnvelopeInput,
    target: TargetSelector,
    action: ControlAction,
    payload: ControlPayload,
    executeAt?: number
): Omit<NonSystemControlMessage, 'serverTimestamp'> {
    const commandEnvelope = createCommandEnvelope(envelope);
    const message: Omit<NonSystemControlMessage, 'serverTimestamp'> = {
        type: 'control' as const,
        version: PROTOCOL_VERSION,
        from: 'manager',
        ...commandEnvelope,
        target,
        action,
        payload,
        clientTimestamp: now(),
    };
    if (typeof executeAt === 'number' && Number.isFinite(executeAt)) {
        message.executeAt = executeAt;
    }
    return message;
}

/**
 * Create a control message sent by the server (internal control/gating).
 */
export function createServerControlMessage(
    target: TargetSelector,
    action: ControlAction,
    payload: ControlPayload,
    executeAt?: number
): Omit<ControlMessage, 'serverTimestamp'> {
    const message: Omit<ControlMessage, 'serverTimestamp'> = {
        type: 'control' as const,
        version: PROTOCOL_VERSION,
        from: 'server',
        ...createSystemCommandEnvelope(),
        target,
        action,
        payload,
        clientTimestamp: now(),
    };
    if (typeof executeAt === 'number' && Number.isFinite(executeAt)) {
        message.executeAt = executeAt;
    }
    return message;
}

/**
 * Create a sensor data message
 */
export function createSensorDataMessage(
    clientId: string,
    sensorType: SensorType,
    payload: SensorPayload
): Omit<SensorDataMessage, 'serverTimestamp'> {
    return {
        type: 'data' as const,
        version: PROTOCOL_VERSION,
        from: 'client',
        clientId,
        sensorType,
        payload,
        clientTimestamp: now(),
    };
}

/**
 * Create a media metadata message
 */
export function createMediaMetaMessage(
    envelope: CommandEnvelopeInput,
    target: TargetSelector,
    mediaType: MediaType,
    url: string,
    executeAt: number,
    options?: MediaMetaMessage['options']
): Omit<NonSystemMediaMetaMessage, 'serverTimestamp'> {
    const commandEnvelope = createCommandEnvelope(envelope);
    const message: Omit<NonSystemMediaMetaMessage, 'serverTimestamp'> = {
        type: 'media' as const,
        version: PROTOCOL_VERSION,
        from: 'manager',
        ...commandEnvelope,
        target,
        mediaType,
        url,
        executeAt,
        clientTimestamp: now(),
    };
    if (options !== undefined) {
        message.options = options;
    }
    return message;
}

/**
 * Create a plugin control message
 */
export function createPluginControlMessage(
    envelope: CommandEnvelopeInput,
    target: TargetSelector,
    pluginId: PluginId,
    command: PluginCommand,
    payload?: Record<string, unknown>
): Omit<NonSystemPluginControlMessage, 'serverTimestamp'> {
    const commandEnvelope = createCommandEnvelope(envelope);
    const message: Omit<NonSystemPluginControlMessage, 'serverTimestamp'> = {
        type: 'plugin' as const,
        version: PROTOCOL_VERSION,
        from: 'manager',
        ...commandEnvelope,
        target,
        pluginId,
        command,
        clientTimestamp: now(),
    };
    if (payload !== undefined) {
        message.payload = payload;
    }
    return message;
}

/**
 * Create a system message
 */
export function createSystemMessage(
    action: SystemAction,
    payload: SystemMessage['payload']
): Omit<SystemMessage, 'serverTimestamp'> {
    return {
        type: 'system' as const,
        version: PROTOCOL_VERSION,
        action,
        payload,
        clientTimestamp: now(),
    };
}

// Type guards

/**
 * Check if a message is a ControlMessage
 */
export function isControlMessage(msg: Message): msg is ControlMessage {
    return msg.type === 'control';
}

/**
 * Check if a message is a SensorDataMessage
 */
export function isSensorDataMessage(msg: Message): msg is SensorDataMessage {
    return msg.type === 'data';
}

/**
 * Check if a message is a MediaMetaMessage
 */
export function isMediaMetaMessage(msg: Message): msg is MediaMetaMessage {
    return msg.type === 'media';
}

/**
 * Check if a message is a PluginControlMessage
 */
export function isPluginControlMessage(msg: Message): msg is PluginControlMessage {
    return msg.type === 'plugin';
}

/**
 * Check if a message is a SystemMessage
 */
export function isSystemMessage(msg: Message): msg is SystemMessage {
    return msg.type === 'system';
}

/**
 * Create target selector for all clients
 */
export function targetAll(): TargetSelector {
    return { mode: 'all' };
}

/**
 * Create target selector for specific client IDs
 */
export function targetClients(ids: string[]): TargetSelector {
    return { mode: 'clientIds', ids };
}

/**
 * Create target selector for a group
 */
export function targetGroup(groupId: string): TargetSelector {
    return { mode: 'group', groupId };
}

/**
 * Create flashlight control payload
 */
export function flashlightPayload(
    mode: 'off' | 'on' | 'blink',
    options?: { frequency?: number; dutyCycle?: number }
): ControlPayload {
    return {
        mode,
        ...options,
    };
}

/**
 * Create vibration pattern payload
 */
export function vibratePayload(pattern: number[], repeat?: number): ControlPayload {
    return { pattern, repeat };
}

/**
 * Add server timestamp to a message
 */
export function addServerTimestamp<T extends Partial<BaseMessage>>(
    msg: T,
    serverTime: number
): T & { serverTimestamp: number } {
    return {
        ...msg,
        serverTimestamp: serverTime,
    };
}

/**
 * Validate message structure
 */
export function isValidMessage(msg: unknown): msg is MessageWithoutServerTimestamp {
    return validateMessage(msg).ok;
}
