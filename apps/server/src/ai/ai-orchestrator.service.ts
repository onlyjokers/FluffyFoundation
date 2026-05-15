/**
 * Purpose: Run the server-side persistent AI turn loop over semantic environment events.
 */

import { Injectable } from '@nestjs/common';
import type {
  AgentSkillRef,
  AgentSkillRegistry,
  OpenAiCompatibleClient,
} from '@shugu/ai-core';
import type {
  SemanticActor,
  SemanticCommand,
  SemanticCommandResult,
  SemanticGraphSnapshot,
} from '@shugu/node-core';
import { SemanticGraphAuthorityService } from '../semantic/semantic-graph-authority.service.js';

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

export type AiTurnResult = {
  event: AgentEnvironmentEvent;
  turn: {
    plan: AgentCommandPlan | null;
    skills: AgentSkillRef[];
    dispatchResults: SemanticCommandResult[];
  };
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const sanitizePlan = (value: unknown): AgentCommandPlan | null => {
  if (!isRecord(value) || !Array.isArray(value.commands)) return null;
  const commands = value.commands.filter(isRecord).filter((command) => typeof command.type === 'string') as SemanticCommand[];
  if (commands.length === 0) return null;
  return {
    id: String(value.id ?? `ai-turn:${Date.now()}`),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    commands,
    requestedSkillIds: stringArray(value.requestedSkillIds),
  };
};

const compactSnapshot = (snapshot: SemanticGraphSnapshot): Record<string, unknown> => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    params: node.params,
    inputValues: node.inputValues,
    outputValues: node.outputValues,
  })),
  connections: snapshot.connections,
  groups: snapshot.groups.map((group) => ({
    id: group.id,
    nodeIds: group.nodeIds,
    agentInterface: group.agentInterface,
    agentPolicy: group.agentPolicy,
  })),
  runtimeStatus: snapshot.runtimeStatus,
  deviceCapabilities: snapshot.deviceCapabilities,
  errors: snapshot.errors,
});

const nodeTypesFor = (snapshot: SemanticGraphSnapshot): string[] =>
  [...new Set(snapshot.nodes.map((node) => node.type).filter(Boolean))];

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly semanticAuthority: Pick<SemanticGraphAuthorityService, 'getSnapshot' | 'dispatch'>,
    private readonly chatClient: OpenAiCompatibleClient,
    private readonly skillRegistry: AgentSkillRegistry
  ) {}

  async handleEnvironmentEvent(event: AgentEnvironmentEvent): Promise<AiTurnResult> {
    const snapshot = this.semanticAuthority.getSnapshot();
    const skills = this.skillRegistry.resolve({
      nodeTypes: nodeTypesFor(snapshot),
      eventTypes: [event.type],
    });

    const completion = await this.chatClient.completeJson<AgentCommandPlan>({
      messages: [
        {
          role: 'system',
          content: 'You are the FluffyFoundation AI orchestrator. Return only an AgentCommandPlan JSON object.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            event,
            snapshot: compactSnapshot(snapshot),
            skills,
          }),
        },
      ],
      schema: { name: 'agent_command_plan', schema: planSchema },
    });

    const plan = sanitizePlan(completion.parsed);
    if (!plan) return { event, turn: { plan: null, skills, dispatchResults: [] } };

    const activeSkills = plan.requestedSkillIds?.length
      ? this.skillRegistry.resolve({
          nodeTypes: nodeTypesFor(snapshot),
          eventTypes: [event.type],
          requestedSkillIds: plan.requestedSkillIds,
        })
      : skills;

    const dispatchResults: SemanticCommandResult[] = [];
    for (const command of plan.commands) {
      const dryRun = this.semanticAuthority.dispatch({ actor: aiActor, command, dryRun: true });
      dispatchResults.push(dryRun);
      if (!dryRun.ok) break;

      const applied = this.semanticAuthority.dispatch({ actor: aiActor, command, dryRun: false });
      dispatchResults.push(applied);
      if (!applied.ok) break;
    }

    return { event, turn: { plan, skills: activeSkills, dispatchResults } };
  }
}
