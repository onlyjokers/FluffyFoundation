/**
 * Purpose: Run the server-side persistent AI turn loop over semantic environment events.
 */

import { Injectable } from '@nestjs/common';
import type { AgentSkillRef, AgentSkillRegistry, OpenAiCompatibleClient } from '@shugu/ai-core';
import type {
  SemanticActor,
  SemanticCommand,
  SemanticCommandResult,
  SemanticGraphSnapshot,
  SemanticGroup,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const sanitizePlan = (value: unknown): AgentCommandPlan | null => {
  if (!isRecord(value) || !Array.isArray(value.commands)) return null;
  const commands = value.commands
    .filter(isRecord)
    .filter((command) => typeof command.type === 'string') as SemanticCommand[];
  if (commands.length === 0) return null;
  return {
    id: String(value.id ?? `ai-turn:${Date.now()}`),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    commands,
    requestedSkillIds: stringArray(value.requestedSkillIds),
  };
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

const compactSnapshot = (
  snapshot: SemanticGraphSnapshot,
  targetSpace?: SemanticGroup
): Record<string, unknown> => {
  const scopedNodeIds = targetSpace ? scopedNodeIdsFor(targetSpace) : null;
  const nodes = scopedNodeIds
    ? snapshot.nodes.filter((node) => scopedNodeIds.has(String(node.id)))
    : snapshot.nodes;
  const connections = scopedNodeIds
    ? snapshot.connections.filter(
        (connection) =>
          scopedNodeIds.has(String(connection.sourceNodeId)) &&
          scopedNodeIds.has(String(connection.targetNodeId))
      )
    : snapshot.connections;

  return {
    revision: snapshot.revision,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      params: node.params,
      inputValues: node.inputValues,
      outputValues: node.outputValues,
    })),
    connections,
    groups: targetSpace ? [compactGroup(targetSpace)] : snapshot.groups.map(compactGroup),
    runtimeStatus: snapshot.runtimeStatus,
    deviceCapabilities: snapshot.deviceCapabilities,
    errors: snapshot.errors,
  };
};

const nodeTypesFor = (snapshot: SemanticGraphSnapshot, targetSpace?: SemanticGroup): string[] => {
  if (!targetSpace) return [...new Set(snapshot.nodes.map((node) => node.type).filter(Boolean))];
  const scopedNodeIds = scopedNodeIdsFor(targetSpace);
  return [
    ...new Set(
      snapshot.nodes
        .filter((node) => scopedNodeIds.has(String(node.id)))
        .map((node) => node.type)
        .filter(Boolean)
    ),
  ];
};

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

const commandWithDefaultScope = (
  command: SemanticCommand,
  targetSpaceId: string
): SemanticCommand => {
  if (!command.type.startsWith('node.')) return command;
  if (
    'scopeGroupId' in command &&
    typeof command.scopeGroupId === 'string' &&
    command.scopeGroupId.trim()
  ) {
    return command;
  }
  return { ...command, scopeGroupId: targetSpaceId } as SemanticCommand;
};

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly semanticAuthority: Pick<
      SemanticGraphAuthorityService,
      'getSnapshot' | 'dispatch'
    >,
    private readonly chatClient: OpenAiCompatibleClient,
    private readonly skillRegistry: AgentSkillRegistry
  ) {}

  async handleEnvironmentEvent(event: AgentEnvironmentEvent): Promise<AiTurnResult> {
    const snapshot = this.semanticAuthority.getSnapshot();
    const spaces = aiSpacesForEvent(snapshot, event);
    const turns: AiTurn[] = [];

    for (const targetSpace of spaces) {
      const skills = this.skillRegistry.resolve({
        nodeTypes: nodeTypesFor(snapshot, targetSpace),
        eventTypes: [event.type],
      });

      const completion = await this.chatClient.completeJson<AgentCommandPlan>({
        messages: [
          {
            role: 'system',
            content:
              'You are the FluffyFoundation AI orchestrator. Return only an AgentCommandPlan JSON object. Target only the assigned AI Space and use scopeGroupId for scoped node commands.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              event,
              targetSpaceId: targetSpace.id,
              targetSpace: compactGroup(targetSpace),
              snapshot: compactSnapshot(snapshot, targetSpace),
              skills,
            }),
          },
        ],
        schema: { name: 'agent_command_plan', schema: planSchema },
      });

      const plan = sanitizePlan(completion.parsed);
      if (!plan) {
        turns.push({ targetSpaceId: targetSpace.id, plan: null, skills, dispatchResults: [] });
        continue;
      }

      plan.commands = plan.commands.map((command) =>
        commandWithDefaultScope(command, targetSpace.id)
      );

      const activeSkills = plan.requestedSkillIds?.length
        ? this.skillRegistry.resolve({
            nodeTypes: nodeTypesFor(snapshot, targetSpace),
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

      turns.push({ targetSpaceId: targetSpace.id, plan, skills: activeSkills, dispatchResults });
    }

    return { event, turns };
  }
}
