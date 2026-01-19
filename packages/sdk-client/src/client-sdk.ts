import { io, Socket } from 'socket.io-client';
import { makePluginCommand } from '@shugu/plugin-core';
import {
  Message,
  ControlMessage,
  PluginControlMessage,
  SystemMessage,
  MediaMetaMessage,
  SOCKET_EVENTS,
  isControlMessage,
  isPluginControlMessage,
  isSystemMessage,
  isMediaMetaMessage,
  createSensorDataMessage,
  createTimePing,
  processTimePong,
  createTimeSyncState,
  updateTimeSyncState,
  getServerTime,
  calculateExecutionDelay,
  scheduleAtServerTime,
  TimeSyncState,
  TimePongData,
  SensorType,
  SensorPayload,
  ControlPlaneMessage,
  ControlPlaneAction,
  SYSTEM_SCOPE_GROUP_ID,
  createControlMessage,
  createPluginControlMessage,
  createMediaMetaMessage,
  TargetSelector,
  ControlAction,
  ControlPayload,
  PluginId,
  PluginCommand,
  MediaType,
  ControlPlaneGroupPolicy as GroupPolicy,
  ControlPlaneSnapshot,
  ClientInfo,
} from '@shugu/protocol';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ClientState {
  status: ConnectionStatus;
  clientId: string | null;
  timeSync: TimeSyncState;
  visibleClients: ClientInfo[];
  error: string | null;
}

export type MessageHandler<T = Message> = (message: T) => void;

export type SocketTransport = 'polling' | 'websocket';

export type LatestSensorData = {
  sensorType: SensorType;
  payload: SensorPayload;
  /**
   * Local time when the sensor data was produced/sent (ms).
   */
  clientTimestamp: number;
  /**
   * Best-effort server time approximation when produced (ms).
   */
  serverTimestamp: number;
};

export interface ClientIdentity {
  /**
   * Stable ID for a physical device (persist this in localStorage on the client app).
   * Used by the server as the base when generating a unique clientId (e.g. `c_xxx`, `c_xxx_1`).
   */
  deviceId: string;
  /**
   * Stable ID for a browser tab/session (persist this in sessionStorage on the client app).
   * Used to "take over" the same clientId on refresh/reconnect without creating duplicates.
   */
  instanceId: string;
  /**
   * Optional preferred clientId (persist per-tab, e.g. sessionStorage). Server may override to avoid collisions.
   */
  clientId?: string;
}

/**
 * Configuration for ClientSDK
 */
export interface ClientSDKConfig {
  serverUrl: string;
  autoReconnect?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeSyncInterval?: number;
  identity?: ClientIdentity;
  /**
   * Socket.io transports preference.
   * - Default: `['polling', 'websocket']` (best compatibility)
   * - Performance mode: `['websocket']` (less jitter, but may fail on restrictive networks)
   */
  transports?: SocketTransport[];
  query?: Record<string, string>;
}

type ClientSDKInternalConfig = {
  serverUrl: string;
  autoReconnect: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  timeSyncInterval: number;
  identity?: ClientIdentity;
  transports: SocketTransport[];
  query?: Record<string, string>;
};

/**
 * Client SDK for managing Socket.io connection and real-time communication
 */
export class ClientSDK {
  private socket: Socket | null = null;
  private config: ClientSDKInternalConfig;
  private state: ClientState;
  private stateListeners: Set<(state: ClientState) => void> = new Set();
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private timeSyncIntervalId: ReturnType<typeof setInterval> | null = null;
  private latestSensorData: LatestSensorData | null = null;
  private controlPlaneState: {
    safeMode: boolean;
    snapshot: ControlPlaneSnapshot | null;
    lastTransferOffer: null | { offerId: string; fromActorId: string; groupIds: string[] };
  } = { safeMode: true, snapshot: null, lastTransferOffer: null };

  private visibleClients: ClientInfo[] = [];

  constructor(config: ClientSDKConfig) {
    const defaultTransports: SocketTransport[] = ['polling', 'websocket'];
    const transports = (() => {
      const raw = Array.isArray(config.transports) ? config.transports : defaultTransports;
      const normalized = raw.filter(
        (t): t is SocketTransport => t === 'polling' || t === 'websocket'
      );
      const unique = Array.from(new Set(normalized));
      return unique.length > 0 ? unique : defaultTransports;
    })();

    this.config = {
      serverUrl: config.serverUrl,
      autoReconnect: config.autoReconnect ?? true,
      // Default to unlimited retries; the experience client should survive flaky networks.
      reconnectionAttempts: config.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
      reconnectionDelay: config.reconnectionDelay ?? 1000,
      timeSyncInterval: config.timeSyncInterval ?? 5000,
      identity: config.identity,
      transports,
      query: config.query,
    };

    this.state = {
      status: 'disconnected',
      clientId: null,
      timeSync: createTimeSyncState(),
      visibleClients: [],
      error: null,
    };
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

    const auth = this.config.identity ?? undefined;

    this.socket = io(this.config.serverUrl, {
      query: { ...(this.config.query ?? {}), role: 'client' },
      auth,
      transports: this.config.transports,
      // Increase timeouts for mobile networks
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

    this.setupSocketListeners();
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.stopTimeSync();
    this.socket?.disconnect();
    this.socket = null;
    this.updateState({
      status: 'disconnected',
      clientId: null,
    });
  }

  /**
   * Get current state
   */
  getState(): ClientState {
    return { ...this.state, visibleClients: [...this.visibleClients] };
  }

  getVisibleClients(): ClientInfo[] {
    return [...this.visibleClients];
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: (state: ClientState) => void): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to specific message types
   */
  onMessage<T extends Message = Message>(
    type: 'control' | 'plugin' | 'system' | 'media' | 'control-plane' | 'all',
    handler: MessageHandler<T>
  ): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler as MessageHandler);
    return () => this.messageHandlers.get(type)?.delete(handler as MessageHandler);
  }

  /**
   * Subscribe to control messages
   */
  onControl(handler: MessageHandler<ControlMessage>): () => void {
    return this.onMessage('control', handler);
  }

  /**
   * Subscribe to plugin control messages
   */
  onPluginControl(handler: MessageHandler<PluginControlMessage>): () => void {
    return this.onMessage('plugin', handler);
  }

  /**
   * Subscribe to media messages
   */
  onMedia(handler: MessageHandler<MediaMetaMessage>): () => void {
    return this.onMessage('media', handler);
  }

  sendControl(
    target: TargetSelector,
    action: ControlAction,
    payload: ControlPayload,
    executeAt?: number,
    scopeGroupId: string = SYSTEM_SCOPE_GROUP_ID
  ): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;
    if (!scopeGroupId.trim()) return;

    const message = createControlMessage(
      { actorId: this.state.clientId, actorRole: 'client', scopeGroupId },
      target,
      action,
      payload,
      executeAt
    );

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  sendPlugin(
    target: TargetSelector,
    pluginId: PluginId,
    command: PluginCommand,
    payload?: Record<string, unknown>,
    scopeGroupId: string = SYSTEM_SCOPE_GROUP_ID
  ): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;
    if (!scopeGroupId.trim()) return;

    const cmd = makePluginCommand(pluginId, command, payload, scopeGroupId);

    const message = createPluginControlMessage(
      {
        actorId: this.state.clientId,
        actorRole: 'client',
        scopeGroupId: cmd.scopeGroupId ?? scopeGroupId,
      },
      target,
      cmd.pluginId,
      cmd.command,
      cmd.payload
    );

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  sendMedia(
    target: TargetSelector,
    mediaType: MediaType,
    url: string,
    executeAt: number,
    options?: MediaMetaMessage['options'],
    scopeGroupId: string = SYSTEM_SCOPE_GROUP_ID
  ): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;
    if (!scopeGroupId.trim()) return;

    const message = createMediaMetaMessage(
      { actorId: this.state.clientId, actorRole: 'client', scopeGroupId },
      target,
      mediaType,
      url,
      executeAt,
      options
    );

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  requestControlPlaneSnapshot(): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;

    const message: ControlPlaneMessage<'snapshot'> = {
      type: 'control-plane',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: Date.now(),
      actorId: this.state.clientId,
      actorRole: 'client',
      scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
      action: 'snapshot',
      payload: {
        snapshot: this.controlPlaneState.snapshot ?? {
          version: 1,
          safeMode: true,
          policies: {},
          ownership: {},
        },
      },
    };

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  acceptTransfer(offerId: string): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;

    const message: ControlPlaneMessage<'acceptTransfer'> = {
      type: 'control-plane',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: Date.now(),
      actorId: this.state.clientId,
      actorRole: 'client',
      scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
      action: 'acceptTransfer',
      payload: { offerId },
    };

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  denyTransfer(offerId: string): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;

    const message: ControlPlaneMessage<'denyTransfer'> = {
      type: 'control-plane',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: Date.now(),
      actorId: this.state.clientId,
      actorRole: 'client',
      scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
      action: 'denyTransfer',
      payload: { offerId },
    };

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  release(groupIds: string[], scopeGroupId: string = SYSTEM_SCOPE_GROUP_ID): void {
    if (!this.socket?.connected) return;
    if (!this.state.clientId) return;

    const message: ControlPlaneMessage<'release'> = {
      type: 'control-plane',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: Date.now(),
      actorId: this.state.clientId,
      actorRole: 'client',
      scopeGroupId,
      action: 'release',
      payload: { groupIds },
    };

    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  /**
   * Send sensor data to server
   */
  sendSensorData(
    sensorType: SensorType,
    payload: SensorPayload,
    options?: { trackLatest?: boolean }
  ): void {
    const clientTimestamp = Date.now();
    if (options?.trackLatest !== false) {
      this.latestSensorData = {
        sensorType,
        payload,
        clientTimestamp,
        serverTimestamp: getServerTime(this.state.timeSync),
      };
    }

    if (!this.socket?.connected || !this.state.clientId) return;

    const message = createSensorDataMessage(this.state.clientId, sensorType, payload);
    this.socket.emit(SOCKET_EVENTS.MSG, message);
  }

  /**
   * Latest locally produced sensor message (best-effort snapshot).
   * Useful for client-side execution (e.g. node-executor) even when offline.
   */
  getLatestSensorData(): LatestSensorData | null {
    return this.latestSensorData ? { ...this.latestSensorData } : null;
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
   * Schedule action at server time
   */
  scheduleAt(executeAt: number, callback: () => void): { cancel: () => void; delay: number } {
    return scheduleAtServerTime(executeAt, this.state.timeSync, callback);
  }

  /**
   * Calculate delay until server time
   */
  getDelayUntil(serverTime: number): number {
    return calculateExecutionDelay(serverTime, this.state.timeSync);
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[SDK Client] Connected');
      this.updateState({ status: 'connected', error: null });
      this.startTimeSync();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SDK Client] Disconnected:', reason);
      this.stopTimeSync();

      // socket.io does not auto-reconnect if the server explicitly disconnected us.
      if (this.config.autoReconnect && reason !== 'io client disconnect') {
        this.updateState({ status: 'reconnecting', clientId: null });

        if (reason === 'io server disconnect') {
          this.socket?.connect();
        }
        return;
      }

      this.updateState({ status: 'disconnected', clientId: null });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SDK Client] Connection error:', error.message);
      this.updateState({ status: 'error', error: error.message });
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.updateState({ status: 'reconnecting' });
    });

    this.socket.io.on('reconnect', () => {
      console.log('[SDK Client] Reconnected');
      this.updateState({ status: 'connected', error: null });
    });

    // Handle messages
    this.socket.on(SOCKET_EVENTS.MSG, (message: Message) => {
      this.handleMessage(message);
    });

    // Handle time sync pong
    this.socket.on(SOCKET_EVENTS.TIME_PONG, (data: TimePongData) => {
      const result = processTimePong(data);
      const newTimeSync = updateTimeSyncState(this.state.timeSync, result);
      this.updateState({ timeSync: newTimeSync });
    });
  }

  private handleMessage(message: Message): void {
    if (isSystemMessage(message)) {
      this.handleSystemMessage(message as SystemMessage);
    }

    if (message.type === 'control-plane') {
      this.handleControlPlaneMessage(message as ControlPlaneMessage);
    }

    if (isControlMessage(message)) {
      this.dispatchMessage('control', message);
    } else if (isPluginControlMessage(message)) {
      this.dispatchMessage('plugin', message);
    } else if (isMediaMetaMessage(message)) {
      this.dispatchMessage('media', message);
    } else if (isSystemMessage(message)) {
      this.dispatchMessage('system', message);
    }

    this.dispatchMessage('all', message);
  }

  private handleSystemMessage(message: SystemMessage): void {
    switch (message.action) {
      case 'clientRegistered':
        if (message.payload.clientId) {
          const assignedClientId = message.payload.clientId;
          this.updateState({ clientId: assignedClientId });
          console.log('[SDK Client] Registered as:', assignedClientId);

          if (this.socket && this.config.identity) {
            this.config.identity = { ...this.config.identity, clientId: assignedClientId };
            const existingAuth = (this.socket.auth ?? {}) as Record<string, unknown>;
            this.socket.auth = { ...existingAuth, clientId: assignedClientId };
          }
        }
        break;

      case 'clientList': {
        const p = message.payload as { clients?: unknown };
        const clients = Array.isArray(p.clients) ? (p.clients as ClientInfo[]) : [];
        this.visibleClients = clients;
        this.updateState({ visibleClients: clients });
        break;
      }
    }
  }

  getControlPlaneState(): {
    safeMode: boolean;
    snapshot: ControlPlaneSnapshot | null;
    lastTransferOffer: null | { offerId: string; fromActorId: string; groupIds: string[] };
  } {
    return { ...this.controlPlaneState, snapshot: this.controlPlaneState.snapshot };
  }

  onControlPlane(handler: (message: ControlPlaneMessage) => void): () => void {
    if (!this.messageHandlers.has('control-plane')) {
      this.messageHandlers.set('control-plane', new Set());
    }
    this.messageHandlers.get('control-plane')!.add(handler as MessageHandler);
    return () => this.messageHandlers.get('control-plane')?.delete(handler as MessageHandler);
  }

  private handleControlPlaneMessage(message: ControlPlaneMessage): void {
    if (message.action === 'safeModeChanged') {
      this.controlPlaneState.safeMode = Boolean(
        (message.payload as { safeMode?: unknown }).safeMode
      );
    }

    if (message.action === 'snapshot') {
      this.controlPlaneState.snapshot =
        (message.payload as { snapshot?: ControlPlaneSnapshot }).snapshot ?? null;
      if (this.controlPlaneState.snapshot) {
        this.controlPlaneState.safeMode = Boolean(this.controlPlaneState.snapshot.safeMode);
      }
    }

    if (message.action === 'transferOffered') {
      const p = message.payload as { offerId: string; fromActorId: string; groupIds: string[] };
      this.controlPlaneState.lastTransferOffer = {
        offerId: String(p.offerId),
        fromActorId: String(p.fromActorId),
        groupIds: Array.isArray(p.groupIds) ? p.groupIds.map(String) : [],
      };
    }

    this.dispatchMessage('control-plane', message);
  }

  private dispatchMessage(type: string, message: Message): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[SDK Client] Message handler error:', error);
        }
      });
    }
  }

  private updateState(partial: Partial<ClientState>): void {
    this.state = { ...this.state, ...partial };
    this.stateListeners.forEach((listener) => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('[SDK Client] State listener error:', error);
      }
    });
  }

  private startTimeSync(): void {
    // Do immediate sync
    this.doTimeSync();

    // Set up interval
    this.timeSyncIntervalId = setInterval(() => {
      this.doTimeSync();
    }, this.config.timeSyncInterval);
  }

  private stopTimeSync(): void {
    if (this.timeSyncIntervalId) {
      clearInterval(this.timeSyncIntervalId);
      this.timeSyncIntervalId = null;
    }
  }

  private doTimeSync(): void {
    if (!this.socket?.connected) return;
    const pingData = createTimePing();
    this.socket.emit(SOCKET_EVENTS.TIME_PING, pingData);
  }

  /**
   * Send a ping to measure latency
   * Returns RTT in ms
   */
  async ping(): Promise<number> {
    if (!this.socket?.connected) throw new Error('Not connected');

    const start = performance.now();
    return new Promise<number>((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket closed'));

      // We'll use a one-off event listener for the pong
      // Note: server needs to support generic ping/pong or we reuse time:ping
      // We simply reuse time:ping for now as it's already there
      const pingData = createTimePing();

      const handlePong = (data: TimePongData) => {
        if (data.clientTimestamp === pingData.clientTimestamp) {
          const rtt = performance.now() - start;
          this.socket?.off(SOCKET_EVENTS.TIME_PONG, handlePong);
          resolve(rtt);
        }
      };

      this.socket.on(SOCKET_EVENTS.TIME_PONG, handlePong);
      this.socket.emit(SOCKET_EVENTS.TIME_PING, pingData);

      // Timeout
      setTimeout(() => {
        this.socket?.off(SOCKET_EVENTS.TIME_PONG, handlePong);
        reject(new Error('Ping timeout'));
      }, 5000);
    });
  }
}
