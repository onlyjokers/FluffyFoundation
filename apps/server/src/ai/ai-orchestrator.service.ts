/**
 * Purpose: Run the server-side persistent AI turn loop over semantic environment events.
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { AgentSkillRef, AgentSkillRegistry, OpenAiCompatibleClient } from '@shugu/ai-core';
import type {
  SemanticActor,
  SemanticCommand,
  SemanticCommandResult,
  SemanticGraphSnapshot,
  SemanticGroup,
} from '@shugu/node-core';
import { SemanticGraphAuthorityService } from '../semantic/semantic-graph-authority.service.js';
import type { AiDebugLogger } from './ai-debug-logger.js';
import {
  buildCapabilityManifest,
  compactSemanticSnapshot,
  nodeTypesFor,
} from './agent-capability-manifest.js';
import {
  compileAgentPlan,
  parseAgentPlan,
  type AgentPlan,
} from './agent-action-dsl.js';
import {
  createAiConversationMemoryStore,
  type AiConversationMemoryStore,
} from './ai-conversation-memory.js';
import {
  applyAiContextBudget,
  buildPromptMessagesFromBlocks,
  promptBlockContent,
  type AiPromptBlock,
} from './ai-context-budgeter.js';
import { createAiDurableMemory, type AiDurableMemory } from './ai-durable-memory.js';
import { loadAiSystemPromptFromEnv, type AiPromptConfig } from './ai-prompt-config.js';
import { trimRecentConversationMessages } from './ai-recent-message-trimmer.js';

export const AI_CHAT_CLIENT = 'SHUGU_AI_CHAT_CLIENT';
export const AI_SKILL_REGISTRY = 'SHUGU_AI_SKILL_REGISTRY';
export const AI_DURABLE_MEMORY = 'SHUGU_AI_DURABLE_MEMORY';

export type AgentEnvironmentEvent =
  | {
      type: 'client.joined';
      clientId: string;
      groupId?: string;
      message?: string;
    }
  | {
      type: 'client.text.final';
      clientId: string;
      groupId?: string;
      text: string;
    }
  | {
      type: 'client.ui.interaction';
      clientId: string;
      groupId?: string;
      nodeId?: string;
      uiKind?: string;
      pressed?: boolean;
      inputContent?: string;
      firstInputed?: boolean;
      recording?: boolean;
      assetId?: string;
      asset?: string;
      finished?: boolean;
    }
  | {
      type: 'vision.idle';
      clientId: string;
      groupId?: string;
      image?: {
        dataUrl: string;
        mime: string;
        width: number;
        height: number;
        createdAt: number;
      };
    }
  | {
      type: 'display.ready';
      displayId: string;
      groupId?: string;
    };

export type AiAgentTurnContext = {
  trigger?: unknown;
  isSuperseded?: () => boolean;
};

export type AgentCommandPlan = {
  id: string;
  summary?: string;
  commands: SemanticCommand[];
  requestedSkillIds?: string[];
};

export type AiTurn = {
  targetSpaceId: string;
  plan: AgentCommandPlan | null;
  skills: AgentSkillRef[];
  dispatchResults: SemanticCommandResult[];
};

export type AiTurnResult = {
  event: AgentEnvironmentEvent;
  turns: AiTurn[];
};

const aiActor: SemanticActor = { id: 'ai-orchestrator', role: 'ai' };

const planSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['id'],
  anyOf: [{ required: ['actions'] }, { required: ['commands'] }],
  properties: {
    version: { type: 'number' },
    id: { type: 'string' },
    summary: { type: 'string' },
    requestedSkillIds: { type: 'array', items: { type: 'string' } },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['op'],
        properties: {
          op: { type: 'string' },
        },
      },
    },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['type'],
        properties: {
          type: { type: 'string' },
        },
      },
    },
  },
};

const compactGroup = (group: SemanticGroup): Record<string, unknown> => ({
  id: group.id,
  kind: group.kind,
  name: group.name,
  nodeIds: group.nodeIds,
  agentInterface: group.agentInterface,
  agentPolicy: group.agentPolicy,
});

const scopedNodeIdsFor = (space: SemanticGroup): Set<string> =>
  new Set([
    ...space.nodeIds.map(String),
    ...(space.agentPolicy?.targetScope?.nodeIds ?? []).map(String),
  ]);

const eventBindingAliases = (eventType: AgentEnvironmentEvent['type']): AgentEnvironmentEvent['type'][] => {
  if (eventType === 'client.ui.interaction') return ['client.ui.interaction', 'client.text.final'];
  if (eventType === 'vision.idle') return ['vision.idle', 'display.ready'];
  return [eventType];
};

const spaceBindsEvent = (space: SemanticGroup, eventType: AgentEnvironmentEvent['type']): boolean => {
  const bindings = space.agentInterface?.eventBindings ?? [];
  return (
    space.agentPolicy?.enabled === true &&
    space.kind === 'ai-space' &&
    !space.disabled &&
    !space.archived &&
    eventBindingAliases(eventType).some((binding) => bindings.includes(binding))
  );
};

const aiSpacesForEvent = (
  snapshot: SemanticGraphSnapshot,
  event: AgentEnvironmentEvent
): SemanticGroup[] => snapshot.groups.filter((group) => spaceBindsEvent(group, event.type));

const snapshotSummary = (snapshot: SemanticGraphSnapshot): Record<string, unknown> => ({
  revision: snapshot.revision,
  nodeCount: snapshot.nodes.length,
  connectionCount: snapshot.connections.length,
  groupCount: snapshot.groups.length,
  aiSpaceIds: snapshot.groups
    .filter((group) => group.kind === 'ai-space')
    .map((group) => group.id),
});

const dispatchResultForLog = (result: SemanticCommandResult): Record<string, unknown> => ({
  ok: result.ok,
  dryRun: result.dryRun,
  stage: 'stage' in result ? result.stage : undefined,
  message: 'message' in result ? result.message : undefined,
  previousRevision: result.previousRevision,
  appliedRevision: result.appliedRevision,
  validationErrors: 'validationErrors' in result ? result.validationErrors : undefined,
  warnings: 'warnings' in result ? result.warnings : undefined,
  snapshot: result.snapshot ? snapshotSummary(result.snapshot) : undefined,
});

type PromptMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const promptMessageMetrics = (
  messages: PromptMessage[]
): Array<{ id: string; role: PromptMessage['role']; chars: number; sha256: string }> =>
  messages.map((message) => ({
    id: message.id,
    role: message.role,
    chars: message.content.length,
    sha256: createHash('sha256').update(message.content).digest('hex'),
  }));

const eventText = (event: AgentEnvironmentEvent): string => {
  if (event.type === 'client.text.final') return event.text;
  if (event.type === 'client.joined') return event.message ?? '';
  if (event.type === 'client.ui.interaction') {
    return [event.uiKind, event.inputContent, event.assetId, event.asset].filter(Boolean).join(' ');
  }
  if (event.type === 'vision.idle') return event.image ? 'vision idle image available' : 'vision idle';
  return event.displayId;
};

const buildPromptBlocks = (input: {
  systemPrompt: string;
  event: AgentEnvironmentEvent;
  targetSpace: SemanticGroup;
  snapshot: Record<string, unknown>;
  capabilityManifest: Record<string, unknown>;
  memory: unknown;
  durableMemory: unknown;
  skills: AgentSkillRef[];
}): AiPromptBlock[] => {
  const targetSpace = compactGroup(input.targetSpace);
  return [
    { id: 'system', role: 'system', priority: 'must', content: input.systemPrompt },
    {
      id: 'protocol',
      role: 'user',
      priority: 'must',
      content: [
        'AI_ORCHESTRATOR_PROTOCOL_V1',
        'Return only a valid AgentActionPlan JSON object.',
        'Prefer actions over raw commands.',
        'Allowed actions: setParam, addNode, connect, disconnect, removeNode.',
        'Use only IDs, node types, ports, params, and bounds present in later context messages.',
        'Do not use canvas layout or node positions.',
      ].join('\n'),
    },
    {
      id: 'authorityRules',
      role: 'user',
      priority: 'must',
      content: {
        kind: 'authorityRules',
        writeAuthority: 'semantic-command-bus-only',
        mustDryRun: true,
        mustRespectPolicy: true,
        memoryIsAdvisory: true,
        semanticSnapshotIsSourceOfTruth: true,
      },
    },
    {
      id: 'targetSpace',
      role: 'user',
      priority: 'must',
      content: {
        kind: 'targetSpace',
        targetSpaceId: input.targetSpace.id,
        targetSpace,
      },
    },
    { id: 'event', role: 'user', priority: 'must', content: { kind: 'event', event: input.event } },
    {
      id: 'currentTaskContext',
      role: 'user',
      priority: 'high',
      content: { kind: 'currentTaskContext', eventType: input.event.type, text: eventText(input.event) },
    },
    { id: 'snapshot', role: 'user', priority: 'high', content: { kind: 'semanticSnapshot', snapshot: input.snapshot } },
    {
      id: 'capabilityManifest',
      role: 'user',
      priority: 'medium',
      content: { kind: 'capabilityManifest', capabilityManifest: input.capabilityManifest },
    },
    { id: 'skills', role: 'user', priority: 'medium', content: { kind: 'skills', skills: input.skills } },
    {
      id: 'aiNotesAndCustomNodeHints',
      role: 'user',
      priority: 'medium',
      content: { kind: 'aiNotesAndCustomNodeHints', source: 'capabilityManifest.aiSummary' },
    },
    { id: 'durableMemory', role: 'user', priority: 'low', content: input.durableMemory as Record<string, unknown> },
    { id: 'memory', role: 'user', priority: 'low', content: { kind: 'conversationMemory', memory: input.memory } },
  ];
};

@Injectable()
export class AiOrchestratorService {
  private readonly promptConfig: AiPromptConfig;

  constructor(
    private readonly semanticAuthority: Pick<
      SemanticGraphAuthorityService,
      'getSnapshot' | 'dispatch'
    >,
    private readonly chatClient: OpenAiCompatibleClient,
    private readonly skillRegistry: AgentSkillRegistry,
    private readonly aiDebugLogger?: Pick<AiDebugLogger, 'write'>,
    promptConfig: AiPromptConfig = loadAiSystemPromptFromEnv(),
    private readonly memory: AiConversationMemoryStore = createAiConversationMemoryStore(),
    private readonly durableMemory: AiDurableMemory = createAiDurableMemory()
  ) {
    this.promptConfig = promptConfig;
  }

  async handleEnvironmentEvent(
    event: AgentEnvironmentEvent,
    context: AiAgentTurnContext = {}
  ): Promise<AiTurnResult> {
    const eventId = `ai-event:${Date.now()}:${randomUUID()}`;
    const snapshot = this.semanticAuthority.getSnapshot();
    const spaces = aiSpacesForEvent(snapshot, event);
    const turns: AiTurn[] = [];

    this.aiDebugLogger?.write({
      kind: 'ai.event.received',
      eventId,
      event,
      snapshot: snapshotSummary(snapshot),
      targetSpaceIds: spaces.map((space) => space.id),
    });

    for (const targetSpace of spaces) {
      const turnId = `ai-turn:${Date.now()}:${randomUUID()}`;
      const skills = this.skillRegistry.resolve({
        nodeTypes: nodeTypesFor(snapshot, targetSpace),
        eventTypes: [event.type],
      });
      const promptPayload = {
        event,
        targetSpaceId: targetSpace.id,
        targetSpace: compactGroup(targetSpace),
        snapshot: compactSemanticSnapshot(snapshot, targetSpace),
        capabilityManifest: buildCapabilityManifest(snapshot, targetSpace),
        memory: this.memory.snapshot(targetSpace.id),
        durableMemory: await this.durableMemory.recall({
          targetSpaceId: targetSpace.id,
          query: eventText(event),
        }),
        skills,
      };
      const trimmedMemoryEntries = await trimRecentConversationMessages(
        promptPayload.memory.entries.map((entry, index) => ({
          role: 'user' as const,
          id: index,
          content: JSON.stringify(entry),
        }))
      );
      const memoryEntriesByIndex = new Map(promptPayload.memory.entries.map((entry, index) => [index, entry]));
      const conversationMemory = {
        ...promptPayload.memory,
        entries: trimmedMemoryEntries.flatMap((entry) =>
          typeof entry.id === 'number' && memoryEntriesByIndex.has(entry.id)
            ? [memoryEntriesByIndex.get(entry.id)]
            : []
        ),
      };
      const promptBlocks = buildPromptBlocks({
        systemPrompt: this.promptConfig.systemPrompt,
        event,
        targetSpace,
        snapshot: promptPayload.snapshot,
        capabilityManifest: promptPayload.capabilityManifest,
        memory: conversationMemory,
        durableMemory: promptPayload.durableMemory,
        skills,
      });
      const budgetedPrompt = applyAiContextBudget(promptBlocks);
      const promptMessages = budgetedPrompt.blocks.map((block) => ({
        id: block.id,
        role: block.role,
        content: promptBlockContent(block),
      }));
      const promptMetrics = promptMessageMetrics(promptMessages);
      const messages = buildPromptMessagesFromBlocks(budgetedPrompt.blocks);

      this.aiDebugLogger?.write({
        kind: 'ai.turn.request',
        eventId,
        turnId,
        event,
        targetSpaceId: targetSpace.id,
        targetSpace: compactGroup(targetSpace),
        skills,
        chatClient: this.chatClient.describeConfig(),
        promptSource: this.promptConfig.source,
        promptMessages: promptMetrics,
        promptBudget: {
          totalChars: budgetedPrompt.totalChars,
          dropped: budgetedPrompt.dropped,
        },
        messages,
      });

      const startedAt = Date.now();
      let plan: AgentPlan | null = null;
      let activeCompletionRequest: unknown = null;
      try {
        const completion = await this.chatClient.completeJson<AgentCommandPlan>({
          messages,
          schema: { name: 'agent_command_plan', schema: planSchema },
        });
        activeCompletionRequest = completion.request;
        this.aiDebugLogger?.write({
          kind: 'ai.turn.response',
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          durationMs: Date.now() - startedAt,
          raw: completion.raw,
          content: completion.content,
          parsed: completion.parsed,
          request: completion.request,
        });
        plan = await this.planFromCompletion({
          eventId,
          turnId,
          targetSpace,
          snapshot,
          promptPayload,
          baseMessages: messages,
          completion,
        });
      } catch (error) {
        this.aiDebugLogger?.write({
          kind: 'ai.turn.error',
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          phase: 'completion',
          durationMs: Date.now() - startedAt,
          error,
          request: activeCompletionRequest,
        });
        this.memory.rememberFailure({
          targetSpaceId: targetSpace.id,
          event,
          error: error instanceof Error ? error.message : String(error),
        });
        turns.push({ targetSpaceId: targetSpace.id, plan: null, skills, dispatchResults: [] });
        continue;
      }
      if (!plan) {
        this.memory.rememberFailure({
          targetSpaceId: targetSpace.id,
          event,
          error: 'AI turn did not produce a valid plan.',
        });
        turns.push({ targetSpaceId: targetSpace.id, plan: null, skills, dispatchResults: [] });
        continue;
      }

      const activeSkills = plan.requestedSkillIds?.length
        ? this.skillRegistry.resolve({
            nodeTypes: nodeTypesFor(snapshot, targetSpace),
            eventTypes: [event.type],
            requestedSkillIds: plan.requestedSkillIds,
          })
        : skills;

      const dispatchResults: SemanticCommandResult[] = [];
      if (context.isSuperseded?.()) {
        this.memory.rememberFailure({
          targetSpaceId: targetSpace.id,
          event,
          error: 'AI turn was superseded before semantic apply.',
        });
        turns.push({ targetSpaceId: targetSpace.id, plan: null, skills: activeSkills, dispatchResults });
        this.aiDebugLogger?.write({
          kind: 'ai.turn.superseded',
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          plan,
        });
        continue;
      }
      dispatchResults.push(
        ...this.applyPlanCommands({
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          commands: plan.commands,
        })
      );
      this.memory.rememberTurn({
        targetSpaceId: targetSpace.id,
        event,
        plan,
        dispatchResults,
      });

      turns.push({ targetSpaceId: targetSpace.id, plan, skills: activeSkills, dispatchResults });
      this.aiDebugLogger?.write({
        kind: 'ai.turn.complete',
        eventId,
        turnId,
        targetSpaceId: targetSpace.id,
        commandCount: plan.commands.length,
        dispatchResults: dispatchResults.map(dispatchResultForLog),
      });
    }

    return { event, turns };
  }

  private applyPlanCommands(input: {
    eventId: string;
    turnId: string;
    targetSpaceId: string;
    commands: SemanticCommand[];
  }): SemanticCommandResult[] {
    const dispatchResults: SemanticCommandResult[] = [];
    for (const command of input.commands) {
      const applied = this.semanticAuthority.dispatch({ actor: aiActor, command, dryRun: false });
      dispatchResults.push(applied);
      this.aiDebugLogger?.write({
        kind: 'ai.turn.dispatch',
        eventId: input.eventId,
        turnId: input.turnId,
        targetSpaceId: input.targetSpaceId,
        dryRun: false,
        command,
        result: dispatchResultForLog(applied),
      });
      if (!applied.ok) break;
    }
    return dispatchResults;
  }

  private dryRunCommands(input: {
    eventId: string;
    turnId: string;
    targetSpaceId: string;
    commands: SemanticCommand[];
  }): SemanticCommandResult[] {
    const dispatchResults: SemanticCommandResult[] = [];
    for (const command of input.commands) {
      const dryRun = this.semanticAuthority.dispatch({ actor: aiActor, command, dryRun: true });
      dispatchResults.push(dryRun);
      this.aiDebugLogger?.write({
        kind: 'ai.turn.dispatch',
        eventId: input.eventId,
        turnId: input.turnId,
        targetSpaceId: input.targetSpaceId,
        dryRun: true,
        command,
        result: dispatchResultForLog(dryRun),
      });
      if (!dryRun.ok) break;
    }
    return dispatchResults;
  }

  private async planFromCompletion(input: {
    eventId: string;
    turnId: string;
    targetSpace: SemanticGroup;
    snapshot: SemanticGraphSnapshot;
    promptPayload: Record<string, unknown>;
    baseMessages: Array<{ role: 'system' | 'user'; content: string }>;
    completion: { parsed: unknown; content: string };
    repairDepth?: number;
  }): Promise<AgentPlan | null> {
    const parsed = parseAgentPlan(input.completion.parsed, input.completion.content);
    if (!parsed.ok) {
      this.aiDebugLogger?.write({
        kind: 'ai.turn.plan.invalid',
        eventId: input.eventId,
        turnId: input.turnId,
        targetSpaceId: input.targetSpace.id,
        error: parsed.error,
      });
      return this.repairPlan({
        ...input,
        planError: parsed.error,
        repairDetails: parsed,
      });
    }

    const compiled = compileAgentPlan({
      plan: parsed.value,
      snapshot: input.snapshot,
      targetSpace: input.targetSpace,
    });
    if (!compiled.ok) {
      return this.repairPlan({
        ...input,
        planError: compiled.error,
        repairDetails: compiled,
      });
    }

    const dryRunResults = this.dryRunCommands({
      eventId: input.eventId,
      turnId: input.turnId,
      targetSpaceId: input.targetSpace.id,
      commands: compiled.commands,
    });
    const failed = dryRunResults.find((result) => !result.ok);
    if (failed) {
      return this.repairPlan({
        ...input,
        planError: 'Dry-run rejected compiled semantic commands.',
        repairDetails: failed,
      });
    }

    const plan = {
      id: parsed.value.id,
      summary: parsed.value.summary,
      commands: compiled.commands,
      requestedSkillIds: parsed.value.requestedSkillIds,
    };
    this.aiDebugLogger?.write({
      kind: 'ai.turn.plan',
      eventId: input.eventId,
      turnId: input.turnId,
      targetSpaceId: input.targetSpace.id,
      source: parsed.source,
      plan,
      warnings: compiled.warnings,
    });
    return plan;
  }

  private async repairPlan(input: {
    eventId: string;
    turnId: string;
    targetSpace: SemanticGroup;
    snapshot: SemanticGraphSnapshot;
    promptPayload: Record<string, unknown>;
    baseMessages: Array<{ role: 'system' | 'user'; content: string }>;
    completion: { parsed: unknown; content: string };
    planError: string;
    repairDetails: unknown;
    repairDepth?: number;
  }): Promise<AgentPlan | null> {
    const maxAttempts = Number(process.env.SHUGU_AI_REPAIR_MAX_ATTEMPTS ?? 1);
    const repairDepth = input.repairDepth ?? 0;
    if (!Number.isFinite(maxAttempts) || maxAttempts <= repairDepth) return null;
    this.memory.rememberRepair({
      targetSpaceId: input.targetSpace.id,
      error: input.planError,
    });

    const messages = [
      ...input.baseMessages,
      {
        role: 'assistant' as const,
        content: input.completion.content,
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          kind: 'repair',
          error: input.planError,
          details: input.repairDetails,
          instruction: 'Return a corrected valid AgentActionPlan JSON object only.',
          promptPayload: input.promptPayload,
        }),
      },
    ];
    this.aiDebugLogger?.write({
      kind: 'ai.turn.repair.request',
      eventId: input.eventId,
      turnId: input.turnId,
      targetSpaceId: input.targetSpace.id,
      error: input.planError,
      details: input.repairDetails,
      messages,
    });
    const completion = await this.chatClient.completeJson<AgentCommandPlan>({
      messages,
      schema: { name: 'agent_command_plan_repair', schema: planSchema },
    });
    this.aiDebugLogger?.write({
      kind: 'ai.turn.repair.response',
      eventId: input.eventId,
      turnId: input.turnId,
      targetSpaceId: input.targetSpace.id,
      raw: completion.raw,
      content: completion.content,
      parsed: completion.parsed,
      request: completion.request,
    });
    return this.planFromCompletion({
      eventId: input.eventId,
      turnId: input.turnId,
      targetSpace: input.targetSpace,
      snapshot: input.snapshot,
      promptPayload: input.promptPayload,
      baseMessages: input.baseMessages,
      completion,
      repairDepth: repairDepth + 1,
    });
  }
}
