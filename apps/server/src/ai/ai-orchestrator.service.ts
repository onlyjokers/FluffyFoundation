/**
 * Purpose: Run the server-side persistent AI turn loop over semantic environment events.
 */

import { Injectable } from '@nestjs/common';
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
import { loadAiSystemPromptFromEnv, type AiPromptConfig } from './ai-prompt-config.js';

export const AI_CHAT_CLIENT = 'SHUGU_AI_CHAT_CLIENT';
export const AI_SKILL_REGISTRY = 'SHUGU_AI_SKILL_REGISTRY';

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
      type: 'display.ready';
      displayId: string;
      groupId?: string;
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
  required: ['id', 'commands'],
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    requestedSkillIds: { type: 'array', items: { type: 'string' } },
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

const spaceBindsEvent = (space: SemanticGroup, eventType: AgentEnvironmentEvent['type']): boolean =>
  space.agentPolicy?.enabled === true &&
  space.kind === 'ai-space' &&
  !space.disabled &&
  !space.archived &&
  (space.agentInterface?.eventBindings ?? []).includes(eventType);

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
    promptConfig: AiPromptConfig = loadAiSystemPromptFromEnv()
  ) {
    this.promptConfig = promptConfig;
  }

  async handleEnvironmentEvent(event: AgentEnvironmentEvent): Promise<AiTurnResult> {
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
        skills,
      };
      const messages = [
        {
          role: 'system' as const,
          content: this.promptConfig.systemPrompt,
        },
        {
          role: 'user' as const,
          content: JSON.stringify(promptPayload),
        },
      ];

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
        turns.push({ targetSpaceId: targetSpace.id, plan: null, skills, dispatchResults: [] });
        continue;
      }
      if (!plan) {
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
      dispatchResults.push(
        ...this.applyPlanCommands({
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          commands: plan.commands,
        })
      );

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
