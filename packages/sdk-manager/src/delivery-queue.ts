/**
 * Purpose: Manager SDK delivery queue for FF-07 batching, latest-state replay, and metrics.
 */
import {
  classifyDelivery,
  createControlMessage,
  createDeliveryMetrics,
  SOCKET_EVENTS,
  type BaseControlPayload,
  type CommandEnvelopeInput,
  type ControlAction,
  type ControlBatchItem,
  type ControlBatchPayload,
  type DeliveryMetrics,
  type TargetSelector,
} from '@shugu/protocol';
import { mergeControlPayload } from './payload-merge.js';

type SocketLike = {
  connected: boolean;
  emit: (event: string, message: unknown) => void;
};

type PendingControlEntry = {
  target: TargetSelector;
  items: ControlBatchItem[];
};

type PendingLatestStateEntry = {
  item: ControlBatchItem;
  dueAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type ManagerDeliveryQueueConfig = {
  getSocket: () => SocketLike | null;
  getClientCount: () => number;
  getThrottleMs: () => number;
  nextCommandEnvelope: () => CommandEnvelopeInput;
};

const THROTTLED_ACTIONS = new Set<ControlAction>(['modulateSoundUpdate', 'screenColor', 'flashlight', 'vibrate']);

export class ManagerDeliveryQueue {
  private pendingControlByTargetKey: Map<string, PendingControlEntry> = new Map();
  private pendingControlFlushScheduled = false;
  private pendingLatestStateByKey: Map<string, PendingLatestStateEntry> = new Map();
  private lastSentByAction: Map<string, number> = new Map();
  private readonly deliveryMetrics: DeliveryMetrics = createDeliveryMetrics();

  constructor(private readonly config: ManagerDeliveryQueueConfig) {}

  getMetrics(): DeliveryMetrics {
    return { ...this.deliveryMetrics };
  }

  sendControlBatch(target: TargetSelector, items: ControlBatchItem[], executeAt?: number): void {
    const socket = this.config.getSocket();
    if (!socket?.connected) return;
    const payload: ControlBatchPayload = {
      kind: 'control-batch',
      items,
      ...(typeof executeAt === 'number' && Number.isFinite(executeAt) ? { executeAt } : {}),
    };
    this.emit(target, 'custom', payload, executeAt);
  }

  queueControl(target: TargetSelector, item: ControlBatchItem): void {
    const throttleMs = this.config.getThrottleMs();
    const delivery = classifyDelivery(
      createControlMessage(this.config.nextCommandEnvelope(), target, item.action, item.payload, item.executeAt)
    );

    if (
      throttleMs > 0 &&
      delivery.deliveryClass === 'latest-state-control' &&
      delivery.latestStateKey &&
      THROTTLED_ACTIONS.has(item.action) &&
      this.config.getClientCount() > 10
    ) {
      const now = Date.now();
      const lastSent = this.lastSentByAction.get(item.action) ?? 0;
      if (now - lastSent < throttleMs) {
        const waitMs = Math.max(0, throttleMs - (now - lastSent));
        this.queueLatestStateReplay(delivery.latestStateKey, target, item, now + waitMs, waitMs);
        return;
      }
      this.lastSentByAction.set(item.action, now);
    }

    this.enqueueControl(target, item);
  }

  emit(target: TargetSelector, action: ControlAction, payload: BaseControlPayload | ControlBatchPayload, executeAt?: number): void {
    const socket = this.config.getSocket();
    if (!socket?.connected) return;
    const message = createControlMessage(this.config.nextCommandEnvelope(), target, action, payload, executeAt);
    socket.emit(SOCKET_EVENTS.MSG, message);
    this.deliveryMetrics.delivered += 1;
  }

  clearPendingLatestState(): void {
    for (const entry of this.pendingLatestStateByKey.values()) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    }
    this.pendingLatestStateByKey.clear();
  }

  private queueLatestStateReplay(
    latestStateKey: string,
    target: TargetSelector,
    item: ControlBatchItem,
    dueAt: number,
    waitMs: number
  ): void {
    const previous = this.pendingLatestStateByKey.get(latestStateKey);
    if (previous?.timeoutId) clearTimeout(previous.timeoutId);
    this.deliveryMetrics.coalesced += 1;

    const timeoutId = setTimeout(() => {
      this.pendingLatestStateByKey.delete(latestStateKey);
      if (!this.config.getSocket()?.connected) {
        this.deliveryMetrics.rejected += 1;
        return;
      }
      const now = Date.now();
      if (now > dueAt + this.config.getThrottleMs()) this.deliveryMetrics.late += 1;
      this.lastSentByAction.set(item.action, now);
      this.enqueueControl(target, item);
    }, waitMs);

    this.pendingLatestStateByKey.set(latestStateKey, { item, dueAt, timeoutId });
  }

  private enqueueControl(target: TargetSelector, item: ControlBatchItem): void {
    const key = targetKey(target);
    const existing = this.pendingControlByTargetKey.get(key) ?? {
      target: normalizeTarget(target),
      items: [],
    };
    const delivery = classifyDelivery(
      createControlMessage(this.config.nextCommandEnvelope(), target, item.action, item.payload, item.executeAt)
    );

    if (delivery.coalesce) {
      const idx = existing.items.findIndex((entry) => entry.action === item.action);
      if (idx >= 0) {
        const prev = existing.items[idx];
        existing.items[idx] = {
          action: item.action,
          payload: mergeControlPayload(prev.payload, item.payload),
          executeAt: item.executeAt ?? prev.executeAt,
        };
        this.deliveryMetrics.coalesced += 1;
      } else {
        existing.items.push(item);
      }
    } else {
      existing.items.push(item);
    }

    this.pendingControlByTargetKey.set(key, existing);
    if (this.pendingControlFlushScheduled) return;
    this.pendingControlFlushScheduled = true;
    queueMicrotask(() => this.flushQueuedControls());
  }

  private flushQueuedControls(): void {
    this.pendingControlFlushScheduled = false;
    if (!this.config.getSocket()?.connected) {
      this.pendingControlByTargetKey.clear();
      return;
    }

    for (const entry of this.pendingControlByTargetKey.values()) {
      if (entry.items.length === 0) continue;
      if (entry.items.length === 1) {
        const single = entry.items[0];
        this.emit(entry.target, single.action, single.payload, single.executeAt);
        continue;
      }

      const sharedExecuteAt = entry.items[0].executeAt;
      const hasSharedExecuteAt =
        typeof sharedExecuteAt === 'number' &&
        Number.isFinite(sharedExecuteAt) &&
        entry.items.every((item) => item.executeAt === sharedExecuteAt);
      if (hasSharedExecuteAt) {
        const items = entry.items.map(({ action, payload }) => ({ action, payload }));
        this.sendControlBatch(entry.target, items, sharedExecuteAt);
      } else {
        this.sendControlBatch(entry.target, entry.items, undefined);
      }
    }

    this.pendingControlByTargetKey.clear();
  }
}

function targetKey(target: TargetSelector): string {
  if (target.mode === 'all') return 'all';
  if (target.mode === 'group') return `group:${target.groupId}`;
  const ids = (target.ids ?? []).map(String).filter(Boolean).sort();
  return `clientIds:${ids.join(',')}`;
}

function normalizeTarget(target: TargetSelector): TargetSelector {
  if (target.mode !== 'clientIds') return target;
  const ids = (target.ids ?? []).map(String).filter(Boolean).sort();
  return { mode: 'clientIds', ids };
}
