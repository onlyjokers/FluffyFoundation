/**
 * Purpose: Own AI Agent trigger scheduling, latest-wins queueing, and idle vision capture.
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { targetClients, type TargetSelector } from '@shugu/protocol';
import type { SemanticCommandResult } from '@shugu/node-core';
import { AiDebugLogger } from './ai-debug-logger.js';
import {
  AiOrchestratorService,
  type AgentEnvironmentEvent,
  type AiTurnResult,
} from './ai-orchestrator.service.js';

export type AiAgentTriggerPriority = 'system' | 'idle' | 'user';

export type AiAgentTrigger = {
  id?: string;
  source: 'system' | 'user' | 'idle';
  priority: AiAgentTriggerPriority;
  event: AgentEnvironmentEvent;
  createdAt?: number;
};

export type AiAgentRuntimeOptions = {
  orchestrator: Pick<AiOrchestratorService, 'handleEnvironmentEvent'>;
  broadcastSemanticSnapshot: (snapshot: Record<string, unknown>) => void;
  getOnlineClients?: () => Array<{ clientId: string; group?: string }>;
  hasVisionIdleSpace?: () => boolean;
  sendClientControl?: (target: TargetSelector, payload: Record<string, unknown>) => void;
  debugLogger?: Pick<AiDebugLogger, 'write'>;
  now?: () => number;
  idleEnabled?: boolean;
  idleIntervalMs?: number;
  idleQuietMs?: number;
  visionCaptureTimeoutMs?: number;
  autoStartIdle?: boolean;
};

export type AiClientScreenshot = {
  clientId: string;
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
};

const priorityRank: Record<AiAgentTriggerPriority, number> = {
  idle: 0,
  system: 1,
  user: 2,
};

const defaultIdleEnabled = (): boolean => process.env.SHUGU_AI_IDLE_ENABLED === '1';
const numberFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const triggerId = (trigger: AiAgentTrigger, now: number): string =>
  trigger.id ?? `ai-trigger:${trigger.event.type}:${now}`;

const eventClientId = (event: AgentEnvironmentEvent): string | undefined =>
  'clientId' in event && typeof event.clientId === 'string' ? event.clientId : undefined;

export class AiAgentSupersededError extends Error {
  constructor() {
    super('AI Agent trigger was superseded before apply.');
    this.name = 'AiAgentSupersededError';
  }
}

@Injectable()
export class AiAgentRuntimeService implements OnModuleDestroy {
  private activeRun: { id: string; superseded: boolean } | null = null;
  private pendingTrigger: AiAgentTrigger | null = null;
  private running = false;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private lastUserActivityAt = 0;
  private screenshotWaiter:
    | {
        clientId: string;
        resolve: (shot: AiClientScreenshot | null) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    | null = null;

  private readonly orchestrator: Pick<AiOrchestratorService, 'handleEnvironmentEvent'>;
  private broadcastSemanticSnapshot: (snapshot: Record<string, unknown>) => void;
  private getOnlineClients: () => Array<{ clientId: string; group?: string }>;
  private hasVisionIdleSpace: () => boolean;
  private sendClientControl: (target: TargetSelector, payload: Record<string, unknown>) => void;
  private readonly debugLogger?: Pick<AiDebugLogger, 'write'>;
  private readonly now: () => number;
  private readonly idleEnabled: boolean;
  private readonly idleIntervalMs: number;
  private readonly idleQuietMs: number;
  private readonly visionCaptureTimeoutMs: number;

  constructor(options: AiAgentRuntimeOptions) {
    this.orchestrator = options.orchestrator;
    this.broadcastSemanticSnapshot = options.broadcastSemanticSnapshot;
    this.getOnlineClients = options.getOnlineClients ?? (() => []);
    this.hasVisionIdleSpace = options.hasVisionIdleSpace ?? (() => true);
    this.sendClientControl = options.sendClientControl ?? (() => undefined);
    this.debugLogger = options.debugLogger;
    this.now = options.now ?? (() => Date.now());
    this.idleEnabled = options.idleEnabled ?? defaultIdleEnabled();
    this.idleIntervalMs = options.idleIntervalMs ?? numberFromEnv('SHUGU_AI_IDLE_INTERVAL_MS', 15_000);
    this.idleQuietMs = options.idleQuietMs ?? numberFromEnv('SHUGU_AI_IDLE_QUIET_MS', 15_000);
    this.visionCaptureTimeoutMs =
      options.visionCaptureTimeoutMs ?? numberFromEnv('SHUGU_AI_VISION_CAPTURE_TIMEOUT_MS', 5_000);

    if (options.autoStartIdle !== false && this.idleEnabled) {
      this.startIdleTimer();
    }
  }

  onModuleDestroy(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    this.finishScreenshotWaiter(null);
  }

  enqueue(trigger: AiAgentTrigger): void {
    const prepared = {
      ...trigger,
      id: triggerId(trigger, this.now()),
      createdAt: trigger.createdAt ?? this.now(),
    };
    if (prepared.priority === 'user') this.markUserActivity(prepared.createdAt);
    this.debugLogger?.write({ kind: 'ai.agent.trigger.enqueued', trigger: prepared });

    if (!this.activeRun && !this.running) {
      this.pendingTrigger = prepared;
      void this.drain();
      return;
    }

    if (this.activeRun && priorityRank[prepared.priority] >= priorityRank[this.pendingTrigger?.priority ?? 'idle']) {
      this.activeRun.superseded = true;
    }
    this.pendingTrigger = prepared;
  }

  configureBridge(input: {
    broadcastSemanticSnapshot?: (snapshot: Record<string, unknown>) => void;
    getOnlineClients?: () => Array<{ clientId: string; group?: string }>;
    hasVisionIdleSpace?: () => boolean;
    sendClientControl?: (target: TargetSelector, payload: Record<string, unknown>) => void;
  }): void {
    if (input.broadcastSemanticSnapshot) {
      this.broadcastSemanticSnapshot = input.broadcastSemanticSnapshot;
    }
    if (input.getOnlineClients) {
      this.getOnlineClients = input.getOnlineClients;
    }
    if (input.hasVisionIdleSpace) {
      this.hasVisionIdleSpace = input.hasVisionIdleSpace;
    }
    if (input.sendClientControl) {
      this.sendClientControl = input.sendClientControl;
    }
  }

  markUserActivity(at: number = this.now()): void {
    this.lastUserActivityAt = at;
  }

  handleClientScreenshot(input: AiClientScreenshot): void {
    if (!this.screenshotWaiter) return;
    if (this.screenshotWaiter.clientId !== input.clientId) return;
    this.finishScreenshotWaiter(input);
  }

  async runIdleTickForTest(): Promise<void> {
    await this.runIdleTick();
  }

  private startIdleTimer(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      void this.runIdleTick();
    }, this.idleIntervalMs);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pendingTrigger) {
        const trigger = this.pendingTrigger;
        this.pendingTrigger = null;
        const run = { id: trigger.id ?? triggerId(trigger, this.now()), superseded: false };
        this.activeRun = run;
        this.debugLogger?.write({ kind: 'ai.agent.turn.started', trigger });
        try {
          const result = await this.orchestrator.handleEnvironmentEvent(trigger.event, {
            trigger,
            isSuperseded: () => run.superseded,
          });
          if (!run.superseded) {
            this.broadcastAppliedSnapshots(result);
          } else {
            this.debugLogger?.write({ kind: 'ai.agent.turn.superseded', trigger });
          }
        } catch (error) {
          this.debugLogger?.write({ kind: 'ai.agent.turn.error', trigger, error });
          console.error('[AI Agent] trigger failed:', error);
        } finally {
          if (this.activeRun === run) this.activeRun = null;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private broadcastAppliedSnapshots(result: AiTurnResult): void {
    for (const turn of result.turns ?? []) {
      const applied = [...(turn.dispatchResults ?? [])].reverse().find(isAppliedSnapshot);
      if (applied?.snapshot) this.broadcastSemanticSnapshot(applied.snapshot as Record<string, unknown>);
    }
  }

  private async runIdleTick(): Promise<void> {
    const now = this.now();
    if (now - this.lastUserActivityAt < this.idleQuietMs) return;
    if (!this.hasVisionIdleSpace()) return;
    if (this.activeRun || this.pendingTrigger) return;
    const client = this.getOnlineClients()[0];
    if (!client?.clientId) return;
    const shot = await this.requestScreenshot(client.clientId);
    if (!shot) return;
    this.enqueue({
      source: 'idle',
      priority: 'idle',
      event: {
        type: 'vision.idle',
        clientId: client.clientId,
        groupId: client.group,
        image: {
          dataUrl: shot.dataUrl,
          mime: shot.mime,
          width: shot.width,
          height: shot.height,
          createdAt: shot.createdAt,
        },
      },
      createdAt: this.now(),
    });
  }

  private async requestScreenshot(clientId: string): Promise<AiClientScreenshot | null> {
    if (this.screenshotWaiter) return null;
    const target = targetClients([clientId]);
    const payload = {
      kind: 'push-image-upload',
      reason: 'ai-agent-idle-vision',
      seq: this.now(),
      format: 'webp',
      quality: 0.7,
      maxWidth: 960,
    };
    this.sendClientControl(target, payload);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => this.finishScreenshotWaiter(null), this.visionCaptureTimeoutMs);
      this.screenshotWaiter = { clientId, resolve, timeout };
    });
  }

  private finishScreenshotWaiter(shot: AiClientScreenshot | null): void {
    const waiter = this.screenshotWaiter;
    if (!waiter) return;
    this.screenshotWaiter = null;
    clearTimeout(waiter.timeout);
    waiter.resolve(shot);
  }
}

function isAppliedSnapshot(
  result: SemanticCommandResult
): result is SemanticCommandResult & { snapshot: Record<string, unknown> } {
  return Boolean(result.ok && !result.dryRun && result.snapshot);
}
