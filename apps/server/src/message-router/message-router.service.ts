import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { ClientRegistryService } from '../client-registry/client-registry.service.js';
import type {
  ControlMessage,
  SensorDataMessage,
  MediaMetaMessage,
  PluginControlMessage,
  ControlPlaneMessage,
  SystemMessage,
  Message,
  MessageWithoutServerTimestamp,
  TargetSelector,
} from '@shugu/protocol';
import { addServerTimestamp, PROTOCOL_VERSION } from '@shugu/protocol';

/**
 * High-frequency control actions that can use volatile emit.
 * These actions are typically MIDI-driven updates where missing a frame is acceptable.
 */
const VOLATILE_ACTIONS = new Set(['modulateSoundUpdate', 'screenColor', 'flashlight']);

/**
 * Actions that should always use reliable emit (never drop).
 */
const RELIABLE_ACTIONS = new Set([
  'playMedia',
  'stopMedia',
  'playSound',
  'stopSound',
  'showImage',
  'hideImage',
  'visualScenes',
  'visualEffects',
  'modulateSound', // initial play should be reliable
]);

@Injectable()
export class MessageRouterService {
  private server: Server | null = null;

  // Rate limiting for high-frequency broadcasts
  private lastBroadcastTime: Map<string, number> = new Map();
  private readonly minBroadcastIntervalMs = 22; // ~45fps max

  constructor(private readonly clientRegistry: ClientRegistryService) {}

  /**
   * Set Socket.io server instance
   */
  setServer(server: Server): void {
    this.server = server;
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
      case 'control-plane':
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
    if (socketIds.length === 0) return;

    const action = message.action;
    const isVolatile = VOLATILE_ACTIONS.has(action) && !RELIABLE_ACTIONS.has(action);

    // Rate limiting for volatile actions when broadcasting to many clients
    if (isVolatile && socketIds.length > 50) {
      const now = Date.now();
      const lastTime = this.lastBroadcastTime.get(action) ?? 0;
      if (now - lastTime < this.minBroadcastIntervalMs) {
        // Skip this message to prevent backpressure buildup
        return;
      }
      this.lastBroadcastTime.set(action, now);
    }

    // Use volatile emit for high-frequency updates (can be dropped if buffer full)
    if (isVolatile) {
      this.emitVolatile(socketIds, message);
    } else {
      this.emitToSockets(socketIds, message);
    }
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
    if (
      sensorType === 'mic' ||
      sensorType === 'gyro' ||
      sensorType === 'accel' ||
      sensorType === 'orientation'
    ) {
      // Drop these - they're too frequent and not critical
      return;
    }

    // For 'custom' sensor type, allow only important system messages
    if (sensorType === 'custom') {
      const payload = message.payload as Record<string, unknown> | undefined;
      const kind = payload?.kind;

      // Allowlist: only these custom kinds are forwarded
      const allowedKinds = [
        'client-screenshot', // Push Image upload - MUST keep
        'multimedia-core', // Asset preload status
        'tone', // Tone.js readiness
        'node-media', // Media playback events
        'node-executor', // NodeExecutor status (deploy/stop/errors)
        'display', // Display readiness
      ];

      if (typeof kind !== 'string' || !allowedKinds.includes(kind)) {
        // Unknown or high-frequency custom data - drop it
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
  private resolveTargetSocketIds(
    target: TargetSelector,
    roleFilter: 'client' | 'manager'
  ): string[] {
    switch (target.mode) {
      case 'all':
        return roleFilter === 'client'
          ? this.clientRegistry.getAllClientSocketIds()
          : this.clientRegistry.getAllManagerSocketIds();

      case 'clientIds':
        return this.clientRegistry.getSocketIds(target.ids);

      case 'group': {
        const clients = this.clientRegistry.getClientsByGroup(target.groupId);
        return clients.map((c) => c.socketId);
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

    const message = addServerTimestamp(
      {
        type: 'system',
        version: PROTOCOL_VERSION,
        action: 'clientList',
        payload: { clients },
      },
      Date.now()
    ) as SystemMessage;

    this.emitToSockets(managerSocketIds, message);
  }

  /**
   * Notify managers of client join
   */
  notifyClientJoined(clientId: string): void {
    if (!this.server) return;

    const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();
    const message = addServerTimestamp(
      {
        type: 'system',
        version: PROTOCOL_VERSION,
        action: 'clientJoined',
        payload: { clientId },
      },
      Date.now()
    ) as SystemMessage;

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
    const message = addServerTimestamp(
      {
        type: 'system',
        version: PROTOCOL_VERSION,
        action: 'clientLeft',
        payload: { clientId },
      },
      Date.now()
    ) as SystemMessage;

    this.emitToSockets(managerSocketIds, message);

    // Also send full client list
    this.broadcastClientListUpdate();
  }

  /**
   * Send registration confirmation to a client
   */
  sendRegistrationConfirmation(socketId: string, clientId: string): void {
    if (!this.server) return;

    const message = addServerTimestamp(
      {
        type: 'system',
        version: PROTOCOL_VERSION,
        action: 'clientRegistered',
        payload: { clientId },
      },
      Date.now()
    ) as SystemMessage;

    this.server.to(socketId).emit('msg', message);
  }

  private emitToSockets(socketIds: string[], message: Message): void {
    if (!this.server) return;
    if (socketIds.length === 0) return;
    // Note: this still sends one packet per connection, but avoids per-socket JS loop jitter.
    this.server.to(socketIds).emit('msg', message);
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
  }
}
