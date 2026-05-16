/**
 * Purpose: Provide the server-side AI orchestrator and its model/skill dependencies.
 */

import { Module } from '@nestjs/common';
import {
  createAgentSkillRegistry,
  createOpenAiCompatibleClient,
  type AgentSkillDoc,
  type AgentSkillRegistry,
  type OpenAiCompatibleClient,
} from '@shugu/ai-core';
import { SemanticModule } from '../semantic/semantic.module.js';
import { SemanticGraphAuthorityService } from '../semantic/semantic-graph-authority.service.js';
import {
  AI_CHAT_CLIENT,
  AI_SKILL_REGISTRY,
  AiOrchestratorService,
} from './ai-orchestrator.service.js';
import { AiDebugLogger, createAiDebugLoggerFromEnv } from './ai-debug-logger.js';

const defaultSkills: AgentSkillDoc[] = [
  {
    id: 'node.display-breathing',
    title: 'Display Breathing Node',
    summary: 'Controls display breathing visuals through bounded intensity and breathRate params.',
    triggers: {
      nodeTypes: ['display-breathing'],
      commandTypes: ['node.params.update'],
      eventTypes: ['display.ready', 'client.text.final'],
    },
    content:
      'Use bounded intensity 0..1 and breathRate 0.1..2; clamp out-of-range repair attempts.',
  },
  {
    id: 'command.node-add',
    title: 'Scoped Node Add',
    summary: 'Use node.add with scopeGroupId inside an AI Space sandbox.',
    triggers: {
      commandTypes: ['node.add'],
      eventTypes: ['client.joined'],
    },
    content:
      'scopeGroupId must point to an AI Space (kind=ai-space) with enabled agentPolicy and allowNewNodes.',
  },
  {
    id: 'demo.ai-space-reaction',
    title: 'AI Space Client and Display Reaction',
    summary:
      'For client.joined and client.text.final, update only nodes inside the assigned AI Space to answer with text and pulse the client/display.',
    triggers: {
      nodeTypes: ['proc-flashlight', 'proc-screen-color', 'proc-display-text', 'string', 'show-anything'],
      commandTypes: ['node.params.update'],
      eventTypes: ['client.joined', 'client.text.final', 'display.ready'],
    },
    content:
      'Use node.params.update with the target AI Space scopeGroupId. On client.text.final, write a concise answer into the proc-display-text text param and mirror it into the string preview value. Keep colors, rates, opacity, and text concise. Do not touch network or secret surfaces.',
  },
];

const createNoopAiClient = (): OpenAiCompatibleClient => ({
  describeConfig: () => ({
    baseUrl: '',
    model: 'disabled',
    apiKey: '[REDACTED]',
    supportsJsonSchema: true,
    timeoutMs: 0,
  }),
  completeJson: async (input) => ({
    raw: null,
    content: '',
    parsed: null,
    request: { url: '', body: { messages: input.messages } },
  }),
});

const createConfiguredAiClient = (aiDebugLogger?: AiDebugLogger): OpenAiCompatibleClient => {
  const apiKey = process.env.SHUGU_AI_OPENAI_API_KEY?.trim();
  const model = process.env.SHUGU_AI_OPENAI_MODEL?.trim() || 'gpt-5.5';
  const baseUrl = process.env.SHUGU_AI_OPENAI_BASE_URL?.trim() || 'https://code.b886.top/v1';
  const timeoutMs = Number(process.env.SHUGU_AI_OPENAI_TIMEOUT_MS);
  if (!apiKey) return createNoopAiClient();
  return createOpenAiCompatibleClient({
    apiKey,
    model,
    baseUrl,
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    logger: (event) => aiDebugLogger?.write({ kind: 'ai.provider', providerEvent: event }),
  });
};

@Module({
  imports: [SemanticModule],
  providers: [
    {
      provide: AI_SKILL_REGISTRY,
      useFactory: () => createAgentSkillRegistry({ skills: defaultSkills }),
    },
    { provide: AiDebugLogger, useFactory: createAiDebugLoggerFromEnv },
    {
      provide: AI_CHAT_CLIENT,
      inject: [AiDebugLogger],
      useFactory: createConfiguredAiClient,
    },
    {
      provide: AiOrchestratorService,
      inject: [SemanticGraphAuthorityService, AI_CHAT_CLIENT, AI_SKILL_REGISTRY, AiDebugLogger],
      useFactory: (
        semanticAuthority: SemanticGraphAuthorityService,
        chatClient: OpenAiCompatibleClient,
        skillRegistry: AgentSkillRegistry,
        aiDebugLogger: AiDebugLogger
      ) => new AiOrchestratorService(semanticAuthority, chatClient, skillRegistry, aiDebugLogger),
    },
  ],
  exports: [AiOrchestratorService, AiDebugLogger],
})
export class AiModule {}
