import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RedisClientType } from 'redis';

import type {
  ControlPlaneSnapshot,
  GroupId,
  GroupOwnership,
  GroupPolicy,
} from './control-plane.types.js';

function isTransferAllowed(
  fromActorId: string,
  policy: { managerId: string; transferable: boolean }
): boolean {
  const isClientForward = fromActorId !== policy.managerId;
  if (!isClientForward) return true;
  return policy.transferable;
}

const REDIS_KEY = 'shugu:control-plane:v2';

function createEmptySnapshot(): ControlPlaneSnapshot {
  return {
    version: 1,
    safeMode: true,
    policies: {},
    ownership: {},
  };
}

function normalizeOwnership(value: unknown): GroupOwnership | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const groupId = typeof v.groupId === 'string' ? v.groupId : '';
  if (!groupId) return null;
  const ownerStackRaw = v.ownerStack;
  const ownerStack = Array.isArray(ownerStackRaw) ? ownerStackRaw.map(String).filter(Boolean) : [];
  const pending = v.pendingTransfer;
  const pendingTransfer = (() => {
    if (!pending || typeof pending !== 'object') return null;
    const p = pending as Record<string, unknown>;
    const offerId = typeof p.offerId === 'string' ? p.offerId : '';
    const from = typeof p.from === 'string' ? p.from : '';
    const to = typeof p.to === 'string' ? p.to : '';
    const offeredAt =
      typeof p.offeredAt === 'number' && Number.isFinite(p.offeredAt) ? p.offeredAt : 0;
    if (!offerId || !from || !to || offeredAt <= 0) return null;
    return { offerId, from, to, offeredAt };
  })();
  const updatedAt =
    typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : Date.now();

  return { groupId, ownerStack, pendingTransfer, updatedAt };
}

function normalizePolicy(value: unknown): GroupPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const groupId = typeof v.groupId === 'string' ? v.groupId : '';
  const managerId = typeof v.managerId === 'string' ? v.managerId : '';
  if (!groupId || !managerId) return null;
  const transferable = Boolean(v.transferable);
  const allowPartialAccept =
    typeof v.allowPartialAccept === 'boolean' ? v.allowPartialAccept : undefined;
  return {
    groupId,
    managerId,
    transferable,
    ...(typeof allowPartialAccept === 'boolean' ? { allowPartialAccept } : {}),
  };
}

function normalizeSnapshot(value: unknown): ControlPlaneSnapshot {
  if (!value || typeof value !== 'object') return createEmptySnapshot();
  const v = value as Record<string, unknown>;
  const version = v.version;
  if (version !== 1) return createEmptySnapshot();

  const safeMode = Boolean(v.safeMode);

  const policies: Record<GroupId, GroupPolicy> = {};
  const policiesRaw = v.policies;
  if (policiesRaw && typeof policiesRaw === 'object') {
    for (const [k, raw] of Object.entries(policiesRaw as Record<string, unknown>)) {
      const p = normalizePolicy(raw);
      if (!p) continue;
      policies[String(k)] = p;
    }
  }

  const ownership: Record<GroupId, GroupOwnership> = {};
  const ownershipRaw = v.ownership;
  if (ownershipRaw && typeof ownershipRaw === 'object') {
    for (const [k, raw] of Object.entries(ownershipRaw as Record<string, unknown>)) {
      const o = normalizeOwnership(raw);
      if (!o) continue;
      ownership[String(k)] = o;
    }
  }

  return { version: 1, safeMode, policies, ownership };
}

@Injectable()
export class ControlPlaneService {
  private redis: RedisClientType | null = null;
  private snapshot: ControlPlaneSnapshot = createEmptySnapshot();

  attachRedis(client: RedisClientType | null): void {
    this.redis = client;
  }

  getState(): ControlPlaneSnapshot {
    return this.snapshot;
  }

  isSafeMode(): boolean {
    return this.snapshot.safeMode;
  }

  async initFromRedisOrEnterSafeMode(): Promise<void> {
    if (!this.redis) {
      this.snapshot = createEmptySnapshot();
      return;
    }

    try {
      const raw = await this.redis.get(REDIS_KEY);
      if (!raw) {
        this.snapshot = createEmptySnapshot();
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      this.snapshot = normalizeSnapshot(parsed);
    } catch {
      this.snapshot = createEmptySnapshot();
    }
  }

  async persist(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(REDIS_KEY, JSON.stringify(this.snapshot));
    } catch (err) {
      console.warn('[ControlPlane] persist failed:', (err as Error)?.message ?? err);
    }
  }

  async setSafeMode(enabled: boolean): Promise<void> {
    const next = Boolean(enabled);
    if (this.snapshot.safeMode === next) return;
    this.snapshot = { ...this.snapshot, safeMode: next };
    await this.persist();
  }

  async resumeFromRoot(): Promise<void> {
    await this.setSafeMode(false);
  }

  async setGroupPolicies(policies: GroupPolicy[]): Promise<void> {
    const nextPolicies: Record<GroupId, GroupPolicy> = { ...this.snapshot.policies };
    for (const p of policies) {
      nextPolicies[p.groupId] = p;
      const existing = this.snapshot.ownership[p.groupId];
      if (!existing || existing.ownerStack.length === 0) {
        this.snapshot.ownership[p.groupId] = {
          groupId: p.groupId,
          ownerStack: [p.managerId],
          pendingTransfer: null,
          updatedAt: Date.now(),
        };
      }
    }
    this.snapshot = { ...this.snapshot, policies: nextPolicies };
    await this.persist();
  }

  getOwner(groupId: GroupId): string | null {
    const o = this.snapshot.ownership[groupId];
    if (!o) return null;
    const top = o.ownerStack[o.ownerStack.length - 1];
    return top ? String(top) : null;
  }

  hasOwnership(actorId: string, groupId: GroupId): boolean {
    const owner = this.getOwner(groupId);
    if (!owner) return false;
    return owner === actorId;
  }

  async handleActorDisconnected(actorId: string): Promise<void> {
    let changed = false;
    const now = Date.now();

    for (const groupId of Object.keys(this.snapshot.ownership)) {
      const o = this.snapshot.ownership[groupId];
      if (!o) continue;

      const stack = o.ownerStack;
      if (stack.length === 0) continue;
      const current = stack[stack.length - 1];
      if (current !== actorId) continue;

      const nextStack = stack.slice(0, -1);
      if (nextStack.length === 0) {
        const policy = this.snapshot.policies[groupId];
        if (policy?.managerId) nextStack.push(policy.managerId);
      }

      this.snapshot.ownership[groupId] = {
        ...o,
        ownerStack: nextStack,
        pendingTransfer: null,
        updatedAt: now,
      };
      changed = true;
    }

    if (changed) await this.persist();
  }

  async reclaim(managerId: string, groupIds: GroupId[]): Promise<void> {
    const now = Date.now();
    let changed = false;

    for (const groupId of groupIds) {
      const policy = this.snapshot.policies[groupId];
      if (!policy) continue;
      if (policy.managerId !== managerId) continue;

      this.snapshot.ownership[groupId] = {
        groupId,
        ownerStack: [managerId],
        pendingTransfer: null,
        updatedAt: now,
      };
      changed = true;
    }

    if (changed) await this.persist();
  }

  async offerTransfer(
    fromActorId: string,
    toActorId: string,
    groupIds: GroupId[]
  ): Promise<{ offerId: string; groupIds: GroupId[] } | null> {
    if (this.snapshot.safeMode) return null;

    const now = Date.now();
    const offerId = `offer:${randomUUID()}`;

    const eligible: GroupId[] = [];
    const nonTransferableToRollback: GroupId[] = [];

    for (const groupId of groupIds) {
      const policy = this.snapshot.policies[groupId];
      if (!policy) continue;
      const owner = this.getOwner(groupId);
      if (owner !== fromActorId) continue;

      if (!isTransferAllowed(fromActorId, policy)) {
        nonTransferableToRollback.push(groupId);
        continue;
      }

      eligible.push(groupId);
    }

    for (const groupId of nonTransferableToRollback) {
      const policy = this.snapshot.policies[groupId];
      if (!policy) continue;
      this.snapshot.ownership[groupId] = {
        groupId,
        ownerStack: [policy.managerId],
        pendingTransfer: null,
        updatedAt: now,
      };
    }

    if (eligible.length === 0) {
      if (nonTransferableToRollback.length > 0) await this.persist();
      return null;
    }

    for (const groupId of eligible) {
      const current = this.snapshot.ownership[groupId] ?? {
        groupId,
        ownerStack: [fromActorId],
        pendingTransfer: null,
        updatedAt: now,
      };
      this.snapshot.ownership[groupId] = {
        ...current,
        pendingTransfer: { offerId, from: fromActorId, to: toActorId, offeredAt: now },
        updatedAt: now,
      };
    }

    await this.persist();
    return { offerId, groupIds: eligible };
  }

  async acceptTransfer(offerId: string, actorId: string): Promise<GroupId[]> {
    if (this.snapshot.safeMode) return [];

    const now = Date.now();
    const accepted: GroupId[] = [];

    for (const groupId of Object.keys(this.snapshot.ownership)) {
      const o = this.snapshot.ownership[groupId];
      if (!o) continue;

      const p = o.pendingTransfer;
      if (!p) continue;
      if (p.offerId !== offerId) continue;
      if (p.to !== actorId) continue;

      const stack = o.ownerStack;
      if (stack.length === 0) continue;
      if (stack[stack.length - 1] !== p.from) continue;

      const policy = this.snapshot.policies[groupId];
      if (policy && !isTransferAllowed(p.from, policy)) {
        this.snapshot.ownership[groupId] = {
          groupId,
          ownerStack: [policy.managerId],
          pendingTransfer: null,
          updatedAt: now,
        };
        accepted.push(groupId);
        continue;
      }

      this.snapshot.ownership[groupId] = {
        ...o,
        ownerStack: [...stack, actorId],
        pendingTransfer: null,
        updatedAt: now,
      };
      accepted.push(groupId);
    }

    if (accepted.length > 0) await this.persist();
    return accepted;
  }

  async denyTransfer(offerId: string, actorId: string): Promise<GroupId[]> {
    const now = Date.now();
    const cleared: GroupId[] = [];

    for (const groupId of Object.keys(this.snapshot.ownership)) {
      const o = this.snapshot.ownership[groupId];
      if (!o) continue;

      const p = o.pendingTransfer;
      if (!p) continue;
      if (p.offerId !== offerId) continue;
      if (p.to !== actorId) continue;

      this.snapshot.ownership[groupId] = { ...o, pendingTransfer: null, updatedAt: now };
      cleared.push(groupId);
    }

    if (cleared.length > 0) await this.persist();
    return cleared;
  }

  async release(actorId: string, groupIds: GroupId[]): Promise<GroupId[]> {
    const now = Date.now();
    const released: GroupId[] = [];

    for (const groupId of groupIds) {
      const o = this.snapshot.ownership[groupId];
      if (!o) continue;

      const stack = o.ownerStack;
      if (stack.length === 0) continue;
      if (stack[stack.length - 1] !== actorId) continue;

      const nextStack = stack.slice(0, -1);
      if (nextStack.length === 0) {
        const policy = this.snapshot.policies[groupId];
        if (policy?.managerId) nextStack.push(policy.managerId);
      }

      this.snapshot.ownership[groupId] = {
        ...o,
        ownerStack: nextStack,
        pendingTransfer: null,
        updatedAt: now,
      };
      released.push(groupId);
    }

    if (released.length > 0) await this.persist();
    return released;
  }
}
