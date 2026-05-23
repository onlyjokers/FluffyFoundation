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
import { Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import { ClientRegistryService } from '../client-registry/client-registry.service.js';
import { MessageRouterService } from '../message-router/message-router.service.js';
import type {
  ClientPermissions,
  ConnectionRole,
  MessageWithoutServerTimestamp,
  TargetSelector,
  TimePingData,
  ValidationRejectReason,
} from '@shugu/protocol';
import {
  createPolicyRejectReason,
  isNonSystemMutatingCommandMessage,
  createTimePong,
  targetClients,
  validateMessage,
} from '@shugu/protocol';
import { sendServerControl } from '../protocol/server-messages.js';
import { enforceGroupOwnership } from './group-ownership-policy.js';
import { validatePartitionLifecycleIngress } from './partition-lifecycle-policy.js';
import { createSocketCorsOptions, resolveManagerRole } from '../bootstrap/security-policy.js';
import {
  createStateStrategyConfigFromEnv,
  createStateStrategyStatus,
  validateServerStateStrategyConfig,
} from '../bootstrap/state-strategy.js';
import { handleDisplayRouterCommand } from './display-routing.js';
import { AiDebugLogger } from '../ai/ai-debug-logger.js';

function sanitizeGroup(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const limited = trimmed.slice(0, 80);
  const sanitized = limited.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || null;
}

function managedClientGroupId(clientId: string): string {
  return `client:${clientId}`;
}

function sanitizeClientPermissions(value: unknown): ClientPermissions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: ClientPermissions = {};
  const input = value as Record<string, unknown>;
  for (const key of ['microphone', 'motion', 'camera', 'wakeLock', 'geolocation'] as const) {
    const status = input[key];
    if (
      status === 'pending' ||
      status === 'granted' ||
      status === 'denied' ||
      status === 'unavailable' ||
      status === 'unsupported'
    ) {
      out[key] = status;
    }
  }
  return out;
}

@WebSocketGateway({
  cors: createSocketCorsOptions({
    nodeEnv: process.env.NODE_ENV,
    managerKey: process.env.SHUGU_MANAGER_KEY,
    allowInsecureManager: process.env.SHUGU_ALLOW_INSECURE_MANAGER,
    corsOrigins: process.env.SHUGU_CORS_ORIGINS,
    hasHttps: process.env.NODE_ENV === 'production',
  }),
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
    @Optional() private readonly aiDebugLogger?: AiDebugLogger
  ) {
    this.clientRegistry.onClientExpired((clientId) => {
      this.messageRouter.notifyClientLeft(clientId);
    });
  }

  async afterInit(server: Server) {
    console.log('[Gateway] WebSocket server initialized');

    // Try to connect to Redis for better broadcast performance
    // Set DISABLE_REDIS_ADAPTER=1 to compare performance with/without Redis
    const redisUrl = process.env.REDIS_URL;
    const disableRedis = process.env.DISABLE_REDIS_ADAPTER === '1';
    const stateStrategyConfig = createStateStrategyConfigFromEnv();

    validateServerStateStrategyConfig(stateStrategyConfig);
    console.info('[Gateway] Active state strategy', createStateStrategyStatus(stateStrategyConfig));

    if (disableRedis) {
      console.log('[Gateway] Redis adapter disabled via DISABLE_REDIS_ADAPTER=1');
    } else if (process.env.NODE_ENV === 'production' && redisUrl) {
      throw new Error(
        'Production boot denied: REDIS_URL is unsupported while registry/control-plane state is single-server.'
      );
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
  }

  handleConnection(client: Socket) {
    // Requested role from query params (treated as a request, not authority).
    const requestedRole = (client.handshake.query.role as ConnectionRole) || 'client';
    const group = sanitizeGroup(client.handshake.query.group);
    const userAgent = client.handshake.headers['user-agent'];
    const auth = client.handshake.auth as Record<string, unknown> | undefined;

    const expectedManagerKey = (process.env.SHUGU_MANAGER_KEY ?? '').trim();
    const requestedManagerKey = typeof auth?.managerKey === 'string' ? auth.managerKey.trim() : '';

    const role: ConnectionRole = resolveManagerRole({
      requestedRole,
      expectedManagerKey,
      requestedManagerKey,
      allowInsecureManager: process.env.SHUGU_ALLOW_INSECURE_MANAGER,
      nodeEnv: process.env.NODE_ENV,
      address: client.handshake.address,
    });

    if (requestedRole === 'manager' && role !== 'manager') {
      const ip = client.handshake.address;
      console.warn(`[Gateway] Manager role rejected for ${client.id} (ip=${ip ?? 'unknown'})`);
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

    if (role === 'client') {
      this.clientRegistry.setClientGroup(clientId, group ?? managedClientGroupId(clientId));
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
    // Validate the full runtime protocol schema before routing.
    const validation = validateMessage(message);
    if (!validation.ok) {
      this.logRejectedMessage(client.id, validation.reasons, message);
      return;
    }

    const validatedMessage = validation.message;

    if (validatedMessage.type === 'system' && validatedMessage.action === 'clientPermissions') {
      const clientId = this.clientRegistry.getClientIdBySocketId(client.id);
      if (!clientId || this.clientRegistry.isManager(client.id)) return;
      const permissions = sanitizeClientPermissions(validatedMessage.payload.permissions);
      if (!permissions) return;
      this.clientRegistry.setClientPermissions(clientId, permissions);
      this.messageRouter.broadcastClientListUpdate();
      return;
    }

    // Check authorization for control messages
    if (
      validatedMessage.type === 'control' ||
      validatedMessage.type === 'media' ||
      validatedMessage.type === 'plugin' ||
      validatedMessage.type === 'semantic'
    ) {
      if (validatedMessage.type !== 'semantic') {
        const partitionRejectReason = validatePartitionLifecycleIngress(validatedMessage);
        if (partitionRejectReason) {
          return this.logRejectedMessage(client.id, [partitionRejectReason], validatedMessage);
        }
      }
      if (
        isNonSystemMutatingCommandMessage(validatedMessage) &&
        validatedMessage.role === 'client'
      ) {
        this.logRejectedMessage(client.id, [
          createPolicyRejectReason({
            actor: validatedMessage.actor ?? ('from' in validatedMessage ? validatedMessage.from : 'unknown'),
            scope: 'server.ingress.authorization',
            type: validatedMessage.type,
            path: 'role',
            code: 'server.policy.manager_required',
            message: `manager role is required for ${validatedMessage.type} messages`,
          }),
        ], validatedMessage);
        return;
      }
      if (
        isNonSystemMutatingCommandMessage(validatedMessage) &&
        (validatedMessage as MessageWithoutServerTimestamp & { role?: string }).role === 'root'
      ) {
        this.logRejectedMessage(client.id, [
          createPolicyRejectReason({
            actor: validatedMessage.actor ?? ('from' in validatedMessage ? validatedMessage.from : 'unknown'),
            scope: 'server.ingress.authorization',
            type: validatedMessage.type,
            path: 'role',
            code: 'server.policy.root_retired',
            message: 'Root control authority is retired; use a Manager-scoped command',
          }),
        ], validatedMessage);
        return;
      }
      if (!this.clientRegistry.isManager(client.id)) {
        this.logRejectedMessage(client.id, [
          createPolicyRejectReason({
            actor: 'actor' in validatedMessage ? validatedMessage.actor : 'from' in validatedMessage ? validatedMessage.from : 'unknown',
            scope: 'server.ingress.authorization',
            type: validatedMessage.type,
            path: validatedMessage.type === 'semantic' ? 'role' : 'from',
            code: 'server.policy.manager_required',
            message: `manager role is required for ${validatedMessage.type} messages`,
          }),
        ], validatedMessage);
        return;
      }

      if (validatedMessage.type === 'semantic') {
        this.auditMutatingCommand(validatedMessage);
        this.messageRouter.routeMessage(validatedMessage, client.id);
        return;
      }

      if (
        handleDisplayRouterCommand({
          message: validatedMessage,
          isManager: this.clientRegistry.isManager(client.id),
          displays: this.clientRegistry.getDisplayDescriptors(),
          routeMessage: (routed) => this.messageRouter.routeMessage(routed, client.id),
          logRejected: (reasons) => this.logRejectedMessage(client.id, reasons, validatedMessage),
          audit: () => this.auditMutatingCommand(validatedMessage),
        })
      )
        return;

      const scopeRejectReason = this.validateCommandScope(validatedMessage);
      if (scopeRejectReason) {
        return this.logRejectedMessage(client.id, [scopeRejectReason], validatedMessage);
      }

      const ownershipRejectReason = enforceGroupOwnership({
        message: validatedMessage,
        registry: this.clientRegistry,
        commandName: (msg) => this.commandName(msg),
      });
      if (ownershipRejectReason) {
        return this.logRejectedMessage(client.id, [ownershipRejectReason], validatedMessage);
      }
    }

    this.auditMutatingCommand(validatedMessage);

    // Route the message
    this.messageRouter.routeMessage(validatedMessage, client.id);
  }

  private validateCommandScope(message: MessageWithoutServerTimestamp): ValidationRejectReason | null {
    if (!isNonSystemMutatingCommandMessage(message)) return null;

    if (message.target.mode !== 'group') {
      return createPolicyRejectReason({
        actor: message.actor ?? message.from,
        scope: 'server.ingress.scope',
        type: message.type,
        path: 'target.mode',
        code: 'server.policy.scope_mismatch',
        message: 'scoped commands must target their scope group',
      });
    }

    if (message.target.groupId !== message.scopeGroupId) {
      return createPolicyRejectReason({
        actor: message.actor ?? message.from,
        scope: 'server.ingress.scope',
        type: message.type,
        path: 'target.groupId',
        code: 'server.policy.scope_mismatch',
        message: 'target group must match scopeGroupId',
      });
    }

    return null;
  }

  private auditMutatingCommand(message: MessageWithoutServerTimestamp): void {
    if (!isNonSystemMutatingCommandMessage(message)) return;

    console.info('[Gateway] Command audit', {
      actor: message.actor,
      role: message.role,
      scopeGroupId: message.scopeGroupId,
      type: message.type,
      command: this.commandName(message),
      target: message.target as TargetSelector,
      correlationId: message.correlationId,
      idempotencyKey: message.idempotencyKey,
      decision: 'accept',
    });
  }

  private commandName(message: MessageWithoutServerTimestamp): string {
    if (message.type === 'control') return message.action;
    if (message.type === 'plugin') return message.command;
    if (message.type === 'media') return message.mediaType;
    return message.type;
  }

  private logRejectedMessage(
    socketId: string,
    reasons: Array<{
      actor: string;
      scope: string;
      type: string;
      path: string;
      decision: string;
      code: string;
      message: string;
    }>,
    rejectedMessage?: unknown
  ): void {
    for (const reason of reasons) {
      this.aiDebugLogger?.write({
        kind: 'gateway.message.rejected',
        socketId,
        reason,
        message: rejectedMessage,
      });
      console.warn('[Gateway] Message rejected', {
        socketId,
        actor: reason.actor,
        scope: reason.scope,
        type: reason.type,
        path: reason.path,
        decision: reason.decision,
        code: reason.code,
        message: reason.message,
      });
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
