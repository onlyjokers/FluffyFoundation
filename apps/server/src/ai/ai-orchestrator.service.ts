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

const textFromEvent = (event: AgentEnvironmentEvent): string =>
  event.type === 'client.text.final' ? event.text.trim() : '';

const firstNumberFromText = (text: string): number | null => {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
};

const nodesForGroup = (
  snapshot: SemanticGraphSnapshot,
  targetSpace: SemanticGroup
): SemanticGraphSnapshot['nodes'] => {
  const scopedNodeIds = scopedNodeIdsFor(targetSpace);
  return snapshot.nodes.filter((node) => scopedNodeIds.has(String(node.id)));
};

const findNodeByType = (
  snapshot: SemanticGraphSnapshot,
  targetSpace: SemanticGroup,
  type: string
): SemanticGraphSnapshot['nodes'][number] | null =>
  nodesForGroup(snapshot, targetSpace).find((node) => String(node.type) === type) ?? null;

const upstreamParamDriverNodeId = (
  snapshot: SemanticGraphSnapshot,
  targetNodeId: string,
  targetPortId: string
): string | null => {
  const connection = snapshot.connections.find(
    (item) =>
      String(item.targetNodeId) === targetNodeId && String(item.targetPortId) === targetPortId
  );
  return connection ? String(connection.sourceNodeId) : null;
};

const fallbackPlanFor = (
  event: AgentEnvironmentEvent,
  snapshot: SemanticGraphSnapshot,
  targetSpace: SemanticGroup
): AgentCommandPlan | null => {
  const text = textFromEvent(event);
  if (!text) return null;
  const scopeGroupId = targetSpace.id;
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('flash') ||
    text.includes('闪光') ||
    text.includes('闪烁') ||
    text.includes('频率')
  ) {
    const frequency = firstNumberFromText(text);
    if (frequency !== null) {
      const flashlight = findNodeByType(snapshot, targetSpace, 'proc-flashlight');
      if (!flashlight) return null;
      const driverNodeId = upstreamParamDriverNodeId(
        snapshot,
        String(flashlight.id),
        'frequencyHz'
      );
      const targetNodeId = driverNodeId ?? String(flashlight.id);
      const params = driverNodeId ? { value: frequency } : { frequencyHz: frequency };
      return {
        id: 'fallback:flashlight-frequency',
        summary: `Set flashlight frequency to ${frequency}.`,
        commands: [
          {
            type: 'node.params.update',
            scopeGroupId,
            nodeId: targetNodeId,
            params,
          },
        ],
      };
    }
  }

  const commands: SemanticCommand[] = [];
  const stringNode = findNodeByType(snapshot, targetSpace, 'string');
  if (stringNode) {
    commands.push({
      type: 'node.params.update',
      scopeGroupId,
      nodeId: String(stringNode.id),
      params: { value: text },
    });
  }

  const displayText = findNodeByType(snapshot, targetSpace, 'proc-display-text');
  if (displayText) {
    commands.push({
      type: 'node.params.update',
      scopeGroupId,
      nodeId: String(displayText.id),
      params: { text },
    });
  }

  if (commands.length === 0) return null;
  return {
    id: 'fallback:client-text',
    summary: 'Mirror client text into the AI Space text nodes.',
    commands,
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
  const scoped =
    command.type.startsWith('node.') &&
    (!('scopeGroupId' in command) ||
      typeof command.scopeGroupId !== 'string' ||
      !command.scopeGroupId.trim())
      ? ({ ...command, scopeGroupId: targetSpaceId } as SemanticCommand)
      : command;

  if (scoped.type !== 'node.add') return scoped;
  return {
    ...scoped,
    node: {
      ...scoped.node,
      position: { x: 0, y: 0 },
    },
  };
};

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
  constructor(
    private readonly semanticAuthority: Pick<
      SemanticGraphAuthorityService,
      'getSnapshot' | 'dispatch'
    >,
    private readonly chatClient: OpenAiCompatibleClient,
    private readonly skillRegistry: AgentSkillRegistry,
    private readonly aiDebugLogger?: Pick<AiDebugLogger, 'write'>
  ) {}

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
        snapshot: compactSnapshot(snapshot, targetSpace),
        skills,
      };
      const messages = [
        {
          role: 'system' as const,
          content:
            'You are the FluffyFoundation AI orchestrator. Return only an AgentCommandPlan JSON object. Target only the assigned AI Space and use scopeGroupId for scoped node commands.',
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
        messages,
      });

      const startedAt = Date.now();
      let completion;
      try {
        completion = await this.chatClient.completeJson<AgentCommandPlan>({
          messages,
          schema: { name: 'agent_command_plan', schema: planSchema },
        });
      } catch (error) {
        const fallbackPlan = fallbackPlanFor(event, snapshot, targetSpace);
        this.aiDebugLogger?.write({
          kind: 'ai.turn.error',
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          phase: 'completion',
          durationMs: Date.now() - startedAt,
          error,
        });
        if (fallbackPlan) {
          this.aiDebugLogger?.write({
            kind: 'ai.turn.fallback',
            eventId,
            turnId,
            targetSpaceId: targetSpace.id,
            event,
            plan: fallbackPlan,
            reason: 'provider-error',
          });
          const dispatchResults = this.dispatchPlanCommands({
            eventId,
            turnId,
            targetSpaceId: targetSpace.id,
            commands: fallbackPlan.commands,
          });
          turns.push({
            targetSpaceId: targetSpace.id,
            plan: fallbackPlan,
            skills,
            dispatchResults,
          });
          this.aiDebugLogger?.write({
            kind: 'ai.turn.complete',
            eventId,
            turnId,
            targetSpaceId: targetSpace.id,
            commandCount: fallbackPlan.commands.length,
            dispatchResults: dispatchResults.map(dispatchResultForLog),
          });
          continue;
        }
        throw error;
      }

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

      const plan = sanitizePlan(completion.parsed) ?? fallbackPlanFor(event, snapshot, targetSpace);
      this.aiDebugLogger?.write({
        kind: 'ai.turn.plan',
        eventId,
        turnId,
        targetSpaceId: targetSpace.id,
        plan,
      });
      if (plan?.id.startsWith('fallback:')) {
        this.aiDebugLogger?.write({
          kind: 'ai.turn.fallback',
          eventId,
          turnId,
          targetSpaceId: targetSpace.id,
          event,
          plan,
          reason: completion.parsed ? 'invalid-provider-plan' : 'missing-provider-plan',
        });
      }
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
      dispatchResults.push(
        ...this.dispatchPlanCommands({
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

  private dispatchPlanCommands(input: {
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
}
