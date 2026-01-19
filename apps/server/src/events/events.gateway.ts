import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import { ClientRegistryService } from '../client-registry/client-registry.service.js';
import { MessageRouterService } from '../message-router/message-router.service.js';
import { ControlPlaneService } from '../control-plane/control-plane.service.js';
import type {
  ConnectionRole,
  TimePingData,
  MessageWithoutServerTimestamp,
  ControlPlaneMessage,
  ControlPlaneAction,
  ControlPlaneGroupPolicy as GroupPolicy,
} from '@shugu/protocol';
import {
  createTimePong,
  isValidMessage,
  targetClients,
  SYSTEM_SCOPE_GROUP_ID,
  PROTOCOL_VERSION,
} from '@shugu/protocol';
import { sendServerControl } from '../protocol/server-messages.js';

function sanitizeGroup(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const limited = trimmed.slice(0, 80);
  const sanitized = limited.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || null;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  // Image pipeline uses DataURL payloads which can exceed Socket.IO's 1MB default.
  // Keep this reasonably high so Push Image Upload -> Display can stream screenshots.
  maxHttpBufferSize: 20 * 1024 * 1024,
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;

  constructor(
    private readonly clientRegistry: ClientRegistryService,
    private readonly messageRouter: MessageRouterService,
    private readonly controlPlane: ControlPlaneService
  ) {
    this.clientRegistry.onClientExpired((clientId) => {
      this.messageRouter.notifyClientLeft(clientId);
      void this.controlPlane.handleActorDisconnected(clientId);
    });
  }

  async afterInit(server: Server) {
    console.log('[Gateway] WebSocket server initialized');

    // Try to connect to Redis for better broadcast performance
    // Set DISABLE_REDIS_ADAPTER=1 to compare performance with/without Redis
    const redisUrl = process.env.REDIS_URL;
    const disableRedis = process.env.DISABLE_REDIS_ADAPTER === '1';

    if (disableRedis) {
      console.log('[Gateway] Redis adapter disabled via DISABLE_REDIS_ADAPTER=1');
    } else if (redisUrl) {
      try {
        console.log('[Gateway] Connecting to Redis adapter...');

        this.pubClient = createClient({ url: redisUrl }) as RedisClientType;
        this.subClient = this.pubClient.duplicate() as RedisClientType;

        // Handle Redis errors gracefully
        this.pubClient.on('error', (err) => {
          console.error('[Redis] Pub client error:', err.message);
        });
        this.subClient.on('error', (err) => {
          console.error('[Redis] Sub client error:', err.message);
        });

        await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

        server.adapter(createAdapter(this.pubClient, this.subClient));
        console.log('[Gateway] ✅ Redis adapter enabled - broadcasts optimized');
      } catch (err) {
        console.warn(
          '[Gateway] ⚠️ Redis adapter failed, using default adapter:',
          (err as Error).message
        );
        // Continue with default adapter
      }
    } else {
      console.log('[Gateway] Redis not configured (set REDIS_URL to enable)');
    }

    this.messageRouter.setServer(server);

    this.controlPlane.attachRedis(this.pubClient);
    await this.controlPlane.initFromRedisOrEnterSafeMode();
  }

  handleConnection(client: Socket) {
    // Requested role from query params (treated as a request, not authority).
    const requestedRole = (client.handshake.query.role as ConnectionRole) || 'client';
    const group = sanitizeGroup(client.handshake.query.group);
    const userAgent = client.handshake.headers['user-agent'];
    const auth = client.handshake.auth as Record<string, unknown> | undefined;

    const expectedManagerKey = (process.env.SHUGU_MANAGER_KEY ?? '').trim();
    const requestedManagerKey = typeof auth?.managerKey === 'string' ? auth.managerKey.trim() : '';

    const role: ConnectionRole =
      requestedRole === 'manager'
        ? expectedManagerKey
          ? requestedManagerKey === expectedManagerKey
            ? 'manager'
            : 'client'
          : 'manager'
        : 'client';

    if (requestedRole === 'manager' && expectedManagerKey && role !== 'manager') {
      const ip = client.handshake.address;
      console.warn(`[Gateway] Manager key rejected for ${client.id} (ip=${ip ?? 'unknown'})`);
    }

    console.log(`[Gateway] Connection: ${client.id} requested=${requestedRole} granted=${role}`);

    // Register the connection
    const { clientId, replacedSocketId, isNewClient } = this.clientRegistry.registerConnection(
      client.id,
      role,
      userAgent,
      {
        deviceId: typeof auth?.deviceId === 'string' ? auth.deviceId : undefined,
        instanceId: typeof auth?.instanceId === 'string' ? auth.instanceId : undefined,
        clientId: typeof auth?.clientId === 'string' ? auth.clientId : undefined,
      }
    );

    if (role === 'client' && group) {
      this.clientRegistry.setClientGroup(clientId, group);
    }

    if (replacedSocketId) {
      const oldSocket = this.server.sockets.sockets.get(replacedSocketId);
      oldSocket?.disconnect(true);
    }

    // Send registration confirmation
    this.messageRouter.sendRegistrationConfirmation(client.id, clientId);

    // Notify managers if a client joined
    if (role === 'client') {
      if (isNewClient) {
        this.messageRouter.notifyClientJoined(clientId);
      } else {
        this.messageRouter.broadcastClientListUpdate();
      }

      const clientInfo = this.clientRegistry.getClient(clientId);
      const active = clientInfo?.selected ?? false;
      sendServerControl(this.messageRouter, targetClients([clientId]), 'setSensorState', {
        active,
      });
    } else if (role === 'manager') {
      // Send current client list to new manager
      this.messageRouter.broadcastClientListUpdate();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[Gateway] Disconnection: ${client.id}`);

    const connectionInfo = this.clientRegistry.unregisterBySocketId(client.id);

    if (connectionInfo && connectionInfo.role === 'client') {
      // Keep presence during grace window; only notify left on expiry.
      this.messageRouter.broadcastClientListUpdate();
    }
  }

  /**
   * Handle main message event
   */
  @SubscribeMessage('msg')
  handleMessage(@MessageBody() message: unknown, @ConnectedSocket() client: Socket): void {
    if (!isValidMessage(message)) {
      console.warn(`[Gateway] Invalid message from ${client.id}:`, message);
      return;
    }

    const actorId = this.clientRegistry.getClientIdBySocketId(client.id);
    if (!actorId) {
      console.warn(`[Gateway] Unknown actor for socket ${client.id}`);
      return;
    }

    const actorRole = this.clientRegistry.isManager(client.id) ? 'manager' : 'client';

    const normalized: MessageWithoutServerTimestamp = (() => {
      if (message.type === 'system') {
        return message;
      }

      if (message.type === 'control-plane') {
        return {
          ...message,
          actorId,
          actorRole,
          scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
        };
      }

      if (message.type === 'data') {
        return {
          ...message,
          actorId,
          actorRole,
          scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
          clientId: actorId,
        };
      }

      return {
        ...message,
        actorId,
        actorRole,
      };
    })();

    if (
      normalized.type === 'control' ||
      normalized.type === 'media' ||
      normalized.type === 'plugin'
    ) {
      if (actorRole === 'client') {
        if (this.controlPlane.isSafeMode()) {
          console.warn(`[Gateway] SafeMode: reject control message from ${actorId}`);
          return;
        }
        if (!this.controlPlane.hasOwnership(actorId, normalized.scopeGroupId)) {
          console.warn(
            `[Gateway] Unauthorized scoped control from ${actorId} scope=${normalized.scopeGroupId}`
          );
          return;
        }
      }
    }

    if (normalized.type === 'control-plane') {
      void this.handleControlPlaneMessage(normalized as ControlPlaneMessage);
      return;
    }

    this.messageRouter.routeMessage(normalized, client.id);
  }

  private emitControlPlaneToManagers(message: ControlPlaneMessage): void {
    const managerSocketIds = this.clientRegistry.getAllManagerSocketIds();
    if (managerSocketIds.length === 0) return;
    this.server.to(managerSocketIds).emit('msg', message);
  }

  private emitControlPlaneToClient(clientId: string, message: ControlPlaneMessage): void {
    const socketId = this.clientRegistry.getSocketId(clientId);
    if (!socketId) return;
    this.server.to(socketId).emit('msg', message);
  }

  private emitControlPlaneToClientIds(clientIds: string[], message: ControlPlaneMessage): void {
    const socketIds = this.clientRegistry.getSocketIds(clientIds);
    if (socketIds.length === 0) return;
    this.server.to(socketIds).emit('msg', message);
  }

  private async handleControlPlaneMessage(message: ControlPlaneMessage): Promise<void> {
    const actorId = message.actorId;
    const actorRole = message.actorRole;

    const payload = message.payload as unknown;

    const now = Date.now();

    const makeServerEvent = <A extends ControlPlaneAction>(
      action: A,
      payload: ControlPlaneMessage<A>['payload']
    ): ControlPlaneMessage<A> => {
      return {
        type: 'control-plane',
        version: PROTOCOL_VERSION,
        serverTimestamp: now,
        clientTimestamp: now,
        actorId: 'server',
        actorRole: 'root',
        scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
        action,
        payload,
      };
    };

    if (message.action === 'snapshot') {
      const snapshot = this.controlPlane.getState();
      const resp = makeServerEvent('snapshot', { snapshot });
      if (actorRole === 'manager') {
        this.emitControlPlaneToManagers(resp);
      } else {
        this.emitControlPlaneToClient(actorId, resp);
      }
      return;
    }

    if (message.action === 'resume') {
      if (actorRole !== 'manager') return;
      await this.controlPlane.resumeFromRoot();
      const safeMode = this.controlPlane.isSafeMode();
      this.emitControlPlaneToManagers(makeServerEvent('safeModeChanged', { safeMode }));
      return;
    }

    if (message.action === 'setGroupPolicies') {
      if (actorRole !== 'manager') return;

      const rawPolicies = (payload as { policies?: unknown }).policies;
      const policiesArray = Array.isArray(rawPolicies) ? (rawPolicies as GroupPolicy[]) : [];
      const policies: GroupPolicy[] = policiesArray.map((p: GroupPolicy) => ({
        groupId: p.groupId,
        managerId: p.managerId,
        transferable: Boolean(p.transferable),
        ...(typeof p.allowPartialAccept === 'boolean'
          ? { allowPartialAccept: p.allowPartialAccept }
          : {}),
      }));

      await this.controlPlane.setGroupPolicies(policies);
      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      this.emitControlPlaneToManagers(makeServerEvent('snapshot', { snapshot }));
      return;
    }

    if (message.action === 'offerTransfer') {
      if (this.controlPlane.isSafeMode()) return;

      const p = payload as { toActorId?: unknown; groupIds?: unknown };
      const toActorId = typeof p.toActorId === 'string' ? p.toActorId : '';
      const groupIds = Array.isArray(p.groupIds) ? p.groupIds.map(String).filter(Boolean) : [];
      if (!toActorId || groupIds.length === 0) return;

      const result = await this.controlPlane.offerTransfer(actorId, toActorId, groupIds);
      if (!result) return;

      this.emitControlPlaneToClient(
        toActorId,
        makeServerEvent('transferOffered', {
          offerId: result.offerId,
          fromActorId: actorId,
          groupIds: result.groupIds,
        })
      );

      this.emitControlPlaneToClient(
        actorId,
        makeServerEvent('offerTransferResult', {
          offerId: result.offerId,
          groupIds: result.groupIds,
        })
      );

      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      return;
    }

    if (message.action === 'acceptTransfer') {
      if (this.controlPlane.isSafeMode()) return;

      const p = payload as { offerId?: unknown };
      const offerId = typeof p.offerId === 'string' ? p.offerId : '';
      if (!offerId) return;

      const groupIds = await this.controlPlane.acceptTransfer(offerId, actorId);
      if (groupIds.length === 0) return;

      this.emitControlPlaneToClient(actorId, makeServerEvent('acceptTransferResult', { groupIds }));
      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      return;
    }

    if (message.action === 'denyTransfer') {
      const p = payload as { offerId?: unknown };
      const offerId = typeof p.offerId === 'string' ? p.offerId : '';
      if (!offerId) return;

      const groupIds = await this.controlPlane.denyTransfer(offerId, actorId);
      if (groupIds.length === 0) return;

      this.emitControlPlaneToClient(actorId, makeServerEvent('denyTransferResult', { groupIds }));
      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      return;
    }

    if (message.action === 'reclaim') {
      if (actorRole !== 'manager') return;

      const p = payload as { groupIds?: unknown };
      const groupIds = Array.isArray(p.groupIds) ? p.groupIds.map(String).filter(Boolean) : [];
      if (groupIds.length === 0) return;

      await this.controlPlane.reclaim(actorId, groupIds);
      this.emitControlPlaneToClient(actorId, makeServerEvent('reclaimResult', { groupIds }));
      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      return;
    }

    if (message.action === 'release') {
      const p = payload as { groupIds?: unknown };
      const groupIds = Array.isArray(p.groupIds) ? p.groupIds.map(String).filter(Boolean) : [];
      if (groupIds.length === 0) return;

      const releasedGroupIds = await this.controlPlane.release(actorId, groupIds);
      if (releasedGroupIds.length === 0) return;

      this.emitControlPlaneToClient(
        actorId,
        makeServerEvent('releaseResult', { groupIds: releasedGroupIds })
      );
      const snapshot = this.controlPlane.getState();
      this.emitControlPlaneToManagers(
        makeServerEvent('ownershipChanged', { ownership: snapshot.ownership })
      );
      return;
    }
  }

  /**
   * Handle time synchronization ping
   */
  @SubscribeMessage('time:ping')
  handleTimePing(@MessageBody() data: TimePingData, @ConnectedSocket() client: Socket): void {
    const pongData = createTimePong(data);
    client.emit('time:pong', pongData);
  }

  /**
   * Handle client selection update from manager
   */
  @SubscribeMessage('select:clients')
  handleSelectClients(
    @MessageBody() data: { clientIds: string[] },
    @ConnectedSocket() client: Socket
  ): void {
    if (!this.clientRegistry.isManager(client.id)) {
      return;
    }

    // Update selection state
    // Calculate changes
    const allClients = this.clientRegistry.getAllClients();
    const previousSelection = new Set(allClients.filter((c) => c.selected).map((c) => c.clientId));
    const newSelection = new Set(data.clientIds);

    const newlySelected = data.clientIds.filter((id) => !previousSelection.has(id));
    const newlyDeselected = Array.from(previousSelection).filter((id) => !newSelection.has(id));

    // Update registry state
    allClients.forEach((c) => {
      this.clientRegistry.setClientSelected(c.clientId, data.clientIds.includes(c.clientId));
    });

    // Notify newly selected clients to START streaming
    if (newlySelected.length > 0) {
      sendServerControl(this.messageRouter, targetClients(newlySelected), 'setSensorState', {
        active: true,
      });
    }

    // Notify newly deselected clients to STOP streaming
    if (newlyDeselected.length > 0) {
      sendServerControl(this.messageRouter, targetClients(newlyDeselected), 'setSensorState', {
        active: false,
      });
    }

    // Broadcast updated client list
    this.messageRouter.broadcastClientListUpdate();
  }
}
