/**
 * Purpose: Own FF-13 client-as-controller transfer offers, TTL, status, and owner recovery.
 */
import {
  createControlPlaneActor,
  createPolicyRejectReason,
  createTransferOffer,
  type ClientControlTransferOffer,
  type ControlPlaneActor,
  type GroupOwnershipEntry,
  type MessageType,
  type ValidationRejectReason,
} from '@shugu/protocol';
import { Injectable } from '@nestjs/common';

type RegistryLike = {
  getGroupOwnershipEntry?: (groupId: string) => GroupOwnershipEntry | undefined;
  reclaimGroupOwnership?: (groupId: string, actor: ControlPlaneActor) => GroupOwnershipEntry;
  releaseGroupOwnership?: (groupId: string, actorId: string) => GroupOwnershipEntry | undefined;
};

type TransferServiceOptions = {
  now?: () => number;
  ttlMs?: number;
  emitStatus?: (status: ClientControlTransferOffer) => void;
};

export type ClientControlTransferCommand =
  | { kind: 'client-control-transfer'; action: 'offer'; groupId: string; targetClientId: string; ttlMs?: number }
  | { kind: 'client-control-transfer'; action: 'accept'; transferId: string }
  | { kind: 'client-control-transfer'; action: 'deny'; transferId: string; reason?: string }
  | { kind: 'client-control-transfer'; action: 'revoke'; transferId: string; groupId?: string; reason?: string };

export type ClientTransferCommandMessage = {
  actor?: string;
  role?: string;
  scopeGroupId?: string;
  type?: string;
  action?: string;
  target?: { mode: string; groupId?: string };
  payload?: unknown;
  transferId?: string;
};

export function isClientControlTransferMessage(message: ClientTransferCommandMessage): boolean {
  return message.type === 'control' && message.action === 'clientControlTransfer';
}

export function isAcceptedClientControllerCommand(input: {
  message: ClientTransferCommandMessage;
  socketClientId?: string;
  hasAcceptedCapability: (input: { clientId: string; transferId?: string; groupId: string }) => boolean;
}): boolean {
  const { message, socketClientId } = input;
  if (message.role !== 'client') return false;
  if (message.target?.mode !== 'group' || typeof message.target.groupId !== 'string') return false;
  if (!socketClientId || message.actor !== socketClientId) return false;
  return input.hasAcceptedCapability({
    clientId: socketClientId,
    transferId: typeof message.transferId === 'string' ? message.transferId : undefined,
    groupId: message.scopeGroupId ?? message.target.groupId,
  });
}

export function isClientTransferResponse(input: {
  message: ClientTransferCommandMessage;
  socketClientId?: string;
}): boolean {
  const payload = input.message.payload as Partial<ClientControlTransferCommand> | undefined;
  if (!isClientControlTransferMessage(input.message)) return false;
  if (!payload || payload.kind !== 'client-control-transfer') return false;
  if (payload.action !== 'accept' && payload.action !== 'deny') return false;
  return Boolean(
    input.socketClientId &&
      input.message.actor === input.socketClientId &&
      input.message.role === 'client'
  );
}

export function handleClientControlTransferCommand(input: {
  message: ClientTransferCommandMessage;
  socketClientId?: string;
  isManager: boolean;
  service: ClientControlTransferService;
  audit: () => void;
  logRejected: (reason: ValidationRejectReason) => void;
}): boolean {
  if (!isClientControlTransferMessage(input.message)) return false;
  const payload = input.message.payload as Partial<ClientControlTransferCommand> | undefined;
  if (!payload || payload.kind !== 'client-control-transfer') return true;

  if (
    payload.action === 'offer' &&
    input.isManager &&
    typeof payload.groupId === 'string' &&
    typeof payload.targetClientId === 'string' &&
    typeof input.message.actor === 'string'
  ) {
    input.service.offer({
      groupId: payload.groupId,
      targetClientId: payload.targetClientId,
      ttlMs: payload.ttlMs,
      actor: createControlPlaneActor({ id: input.message.actor, role: 'manager' }),
    });
    input.audit();
    return true;
  }

  if (payload.action === 'accept' && input.socketClientId && typeof payload.transferId === 'string') {
    const result = input.service.accept(payload.transferId, input.socketClientId);
    if (!result.ok) {
      input.logRejected(
        input.service.rejectReason({
          clientId: input.socketClientId,
          type: input.message.type ?? 'control',
          scopeGroupId: input.message.scopeGroupId ?? '',
        })
      );
    }
    input.audit();
    return true;
  }

  if (payload.action === 'deny' && input.socketClientId && typeof payload.transferId === 'string') {
    input.service.deny(payload.transferId, input.socketClientId, payload.reason);
    input.audit();
    return true;
  }

  if (
    payload.action === 'revoke' &&
    input.isManager &&
    typeof payload.transferId === 'string' &&
    typeof input.message.actor === 'string'
  ) {
    input.service.revoke(payload.transferId, input.message.actor, payload.reason);
    input.audit();
    return true;
  }

  return true;
}

@Injectable()
export class ClientControlTransferService {
  private readonly offers = new Map<string, ClientControlTransferOffer>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly now: () => number;
  private readonly defaultTtlMs: number;
  private emitStatus: (status: ClientControlTransferOffer) => void;

  constructor(private readonly registry: RegistryLike, options: TransferServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.defaultTtlMs = options.ttlMs ?? 30_000;
    this.emitStatus = options.emitStatus ?? (() => undefined);
  }

  setStatusEmitter(emitStatus: (status: ClientControlTransferOffer) => void): void {
    this.emitStatus = emitStatus;
  }

  clear(reason = 'stop-all cleanup'): void {
    for (const transferId of Array.from(this.offers.keys())) {
      this.finish(transferId, { status: 'revoked', revokedAt: this.now(), reason });
    }
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  offer(input: {
    groupId: string;
    targetClientId: string;
    actor: ControlPlaneActor;
    ttlMs?: number;
  }): ClientControlTransferOffer {
    const ttlMs = input.ttlMs ?? this.defaultTtlMs;
    const offer = createTransferOffer({
      groupId: input.groupId,
      targetClientId: input.targetClientId,
      offeredBy: input.actor,
      ttlMs,
      now: this.now(),
    });
    this.offers.set(offer.transferId, offer);
    this.scheduleExpiry(offer);
    this.emitStatus(cloneOffer(offer));
    return cloneOffer(offer);
  }

  accept(transferId: string, clientId: string): { ok: true; offer: ClientControlTransferOffer } | { ok: false; reason: string } {
    const offer = this.offers.get(transferId);
    if (!offer) return { ok: false, reason: 'transfer offer was not found' };
    const expiry = this.expireIfNeeded(offer);
    if (expiry) return { ok: false, reason: 'transfer offer expired' };
    if (offer.status !== 'pending') return { ok: false, reason: `transfer is ${offer.status}` };
    if (offer.targetClientId !== clientId) return { ok: false, reason: 'transfer target does not match client' };

    const actor = createControlPlaneActor({
      id: clientId,
      role: 'client',
      capabilities: offer.capability.capabilities,
    });
    this.registry.reclaimGroupOwnership?.(offer.groupId, actor);
    const accepted: ClientControlTransferOffer = {
      ...offer,
      status: 'accepted',
      acceptedAt: this.now(),
      capability: { ...offer.capability, acceptedAt: this.now() },
    };
    this.offers.set(transferId, accepted);
    this.emitStatus(cloneOffer(accepted));
    return { ok: true, offer: cloneOffer(accepted) };
  }

  deny(transferId: string, clientId: string, reason?: string): { ok: boolean; reason?: string } {
    const offer = this.offers.get(transferId);
    if (!offer) return { ok: false, reason: 'transfer offer was not found' };
    if (offer.targetClientId !== clientId) return { ok: false, reason: 'transfer target does not match client' };
    this.finish(transferId, { status: 'denied', deniedAt: this.now(), reason });
    return { ok: true };
  }

  revoke(transferId: string, actorId: string, reason?: string): { ok: boolean; reason?: string } {
    const offer = this.offers.get(transferId);
    if (!offer) return { ok: false, reason: 'transfer offer was not found' };
    const entry = this.registry.getGroupOwnershipEntry?.(offer.groupId);
    if (entry?.owner.actorId !== actorId && offer.offeredBy.actorId !== actorId && actorId !== 'root') {
      return { ok: false, reason: 'only current or previous owner can revoke transfer' };
    }
    if (offer.status === 'accepted') {
      this.registry.releaseGroupOwnership?.(offer.groupId, offer.targetClientId);
    }
    this.finish(transferId, { status: 'revoked', revokedAt: this.now(), reason });
    return { ok: true };
  }

  handleClientDisconnected(clientId: string): void {
    for (const offer of this.offers.values()) {
      if (offer.targetClientId !== clientId || offer.status !== 'accepted') continue;
      this.registry.releaseGroupOwnership?.(offer.groupId, clientId);
      this.finish(offer.transferId, { status: 'control-lost', revokedAt: this.now(), reason: 'client disconnected' });
    }
  }

  hasAcceptedCapability(input: { clientId: string; transferId?: string; groupId: string; now?: number }): boolean {
    for (const offer of this.offers.values()) {
      if (offer.status !== 'accepted') continue;
      if (offer.targetClientId !== input.clientId) continue;
      if (offer.groupId !== input.groupId) continue;
      if (input.transferId && offer.transferId !== input.transferId) continue;
      if ((input.now ?? this.now()) > offer.expiresAt) {
        this.expireIfNeeded(offer);
        return false;
      }
      return offer.capability.capabilities.includes('group.mutate');
    }
    return false;
  }

  rejectReason(input: { clientId: string; type: string; scopeGroupId: string }): ValidationRejectReason {
    return createPolicyRejectReason({
      actor: input.clientId,
      scope: 'server.ingress.clientControlTransfer',
      type: input.type as MessageType,
      path: 'transferId',
      code: 'server.policy.client_transfer_required',
      message: 'accepted client control transfer capability is required',
    });
  }

  clientIdBySocket(
    registry: RegistryLike & { getClientIdBySocketId?: (socketId: string) => string | undefined },
    socketId: string
  ): string | undefined {
    return registry.getClientIdBySocketId?.(socketId);
  }

  private scheduleExpiry(offer: ClientControlTransferOffer): void {
    const delay = Math.max(0, offer.expiresAt - this.now());
    const previous = this.timers.get(offer.transferId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      const current = this.offers.get(offer.transferId);
      if (current?.status === 'pending') {
        this.finish(offer.transferId, { status: 'expired', reason: 'transfer offer expired' });
      }
    }, delay);
    this.timers.set(offer.transferId, timer);
  }

  private expireIfNeeded(offer: ClientControlTransferOffer): boolean {
    if (offer.status !== 'pending') return false;
    if (this.now() <= offer.expiresAt) return false;
    this.finish(offer.transferId, { status: 'expired', reason: 'transfer offer expired' });
    return true;
  }

  private finish(
    transferId: string,
    patch: Pick<ClientControlTransferOffer, 'status'> & Partial<ClientControlTransferOffer>
  ): void {
    const offer = this.offers.get(transferId);
    if (!offer) return;
    const timer = this.timers.get(transferId);
    if (timer) clearTimeout(timer);
    this.timers.delete(transferId);
    const next = { ...offer, ...patch };
    this.offers.set(transferId, next);
    this.emitStatus(cloneOffer(next));
  }
}

function cloneOffer(offer: ClientControlTransferOffer): ClientControlTransferOffer {
  return {
    ...offer,
    offeredBy: { ...offer.offeredBy, capabilities: [...offer.offeredBy.capabilities] },
    capability: { ...offer.capability, capabilities: [...offer.capability.capabilities] },
  };
}
