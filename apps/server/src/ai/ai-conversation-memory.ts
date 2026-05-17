/**
 * Purpose: Keep bounded per-AI-Space conversation memory for server-side AI turns.
 */

import type { SemanticCommandResult } from '@shugu/node-core';
import type { AgentEnvironmentEvent, AgentCommandPlan } from './ai-orchestrator.service.js';

export type AiConversationMemoryEntry = {
  timestamp: string;
  type: 'turn' | 'repair' | 'failure';
  eventType?: AgentEnvironmentEvent['type'];
  clientId?: string;
  displayId?: string;
  text?: string;
  planId?: string;
  summary?: string;
  commandCount?: number;
  dryRunCount?: number;
  appliedCount?: number;
  failedCount?: number;
  error?: string;
};

export type AiConversationMemorySnapshot = {
  enabled: boolean;
  maxTurns: number;
  maxTotalChars: number;
  entries: AiConversationMemoryEntry[];
};

export type AiConversationMemoryConfig = {
  enabled?: boolean;
  maxTurns?: number;
  maxEntryChars?: number;
  maxTotalChars?: number;
  now?: () => Date;
};

const trueValues = new Set(['1', 'true', 'yes', 'on']);
const falseValues = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_ENTRY_CHARS = 2_000;
const DEFAULT_MAX_TOTAL_CHARS = 12_000;

function flagFromEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (trueValues.has(normalized)) return true;
  if (falseValues.has(normalized)) return false;
  return fallback;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncate(value: string | undefined, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]`;
}

function textFromEvent(event: AgentEnvironmentEvent): string | undefined {
  if (event.type === 'client.text.final') return event.text;
  if (event.type === 'client.joined') return event.message;
  return undefined;
}

function clientIdFromEvent(event: AgentEnvironmentEvent): string | undefined {
  return event.type === 'client.joined' || event.type === 'client.text.final'
    ? event.clientId
    : undefined;
}

function displayIdFromEvent(event: AgentEnvironmentEvent): string | undefined {
  return event.type === 'display.ready' ? event.displayId : undefined;
}

function summarizeDispatch(results: SemanticCommandResult[]): {
  dryRunCount: number;
  appliedCount: number;
  failedCount: number;
} {
  return results.reduce(
    (acc, result) => {
      if (!result.ok) acc.failedCount += 1;
      if (result.dryRun) acc.dryRunCount += 1;
      if (!result.dryRun && result.ok) acc.appliedCount += 1;
      return acc;
    },
    { dryRunCount: 0, appliedCount: 0, failedCount: 0 }
  );
}

function configFromEnv(): Required<
  Pick<AiConversationMemoryConfig, 'enabled' | 'maxTurns' | 'maxEntryChars' | 'maxTotalChars'>
> {
  return {
    enabled: flagFromEnv(process.env.SHUGU_AI_MEMORY, true),
    maxTurns: numberFromEnv(process.env.SHUGU_AI_MEMORY_MAX_TURNS, DEFAULT_MAX_TURNS),
    maxEntryChars: numberFromEnv(process.env.SHUGU_AI_MEMORY_MAX_ENTRY_CHARS, DEFAULT_MAX_ENTRY_CHARS),
    maxTotalChars: numberFromEnv(process.env.SHUGU_AI_MEMORY_MAX_TOTAL_CHARS, DEFAULT_MAX_TOTAL_CHARS),
  };
}

export class AiConversationMemoryStore {
  private readonly enabled: boolean;
  private readonly maxTurns: number;
  private readonly maxEntryChars: number;
  private readonly maxTotalChars: number;
  private readonly now: () => Date;
  private readonly entriesBySpace = new Map<string, AiConversationMemoryEntry[]>();

  constructor(config: AiConversationMemoryConfig = configFromEnv()) {
    this.enabled = config.enabled ?? true;
    this.maxTurns = Math.max(1, Math.floor(config.maxTurns ?? DEFAULT_MAX_TURNS));
    this.maxEntryChars = Math.max(256, Math.floor(config.maxEntryChars ?? DEFAULT_MAX_ENTRY_CHARS));
    this.maxTotalChars = Math.max(this.maxEntryChars, Math.floor(config.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS));
    this.now = config.now ?? (() => new Date());
  }

  snapshot(targetSpaceId: string): AiConversationMemorySnapshot {
    return {
      enabled: this.enabled,
      maxTurns: this.maxTurns,
      maxTotalChars: this.maxTotalChars,
      entries: this.enabled ? [...(this.entriesBySpace.get(targetSpaceId) ?? [])] : [],
    };
  }

  rememberTurn(input: {
    targetSpaceId: string;
    event: AgentEnvironmentEvent;
    plan: AgentCommandPlan;
    dispatchResults: SemanticCommandResult[];
  }): void {
    const dispatch = summarizeDispatch(input.dispatchResults);
    this.push(input.targetSpaceId, {
      timestamp: this.now().toISOString(),
      type: 'turn',
      eventType: input.event.type,
      clientId: clientIdFromEvent(input.event),
      displayId: displayIdFromEvent(input.event),
      text: truncate(textFromEvent(input.event), this.maxEntryChars),
      planId: input.plan.id,
      summary: truncate(input.plan.summary, this.maxEntryChars),
      commandCount: input.plan.commands.length,
      ...dispatch,
    });
  }

  rememberRepair(input: { targetSpaceId: string; eventType?: AgentEnvironmentEvent['type']; error: string }): void {
    this.push(input.targetSpaceId, {
      timestamp: this.now().toISOString(),
      type: 'repair',
      eventType: input.eventType,
      error: truncate(input.error, this.maxEntryChars),
    });
  }

  rememberFailure(input: { targetSpaceId: string; event: AgentEnvironmentEvent; error: string }): void {
    this.push(input.targetSpaceId, {
      timestamp: this.now().toISOString(),
      type: 'failure',
      eventType: input.event.type,
      clientId: clientIdFromEvent(input.event),
      displayId: displayIdFromEvent(input.event),
      text: truncate(textFromEvent(input.event), this.maxEntryChars),
      error: truncate(input.error, this.maxEntryChars),
    });
  }

  private push(targetSpaceId: string, entry: AiConversationMemoryEntry): void {
    if (!this.enabled) return;

    const entries = [...(this.entriesBySpace.get(targetSpaceId) ?? []), entry].slice(-this.maxTurns);
    while (entries.length > 1 && JSON.stringify(entries).length > this.maxTotalChars) {
      entries.shift();
    }
    this.entriesBySpace.set(targetSpaceId, entries);
  }
}

export function createAiConversationMemoryStore(config?: AiConversationMemoryConfig): AiConversationMemoryStore {
  return new AiConversationMemoryStore(config);
}
