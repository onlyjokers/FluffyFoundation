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
import { AI_CHAT_CLIENT, AI_SKILL_REGISTRY, AiOrchestratorService } from './ai-orchestrator.service.js';

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
    content: 'Use bounded intensity 0..1 and breathRate 0.1..2; clamp out-of-range repair attempts.',
  },
  {
    id: 'command.node-add',
    title: 'Scoped Node Add',
    summary: 'Use node.add with scopeGroupId inside an AI Group sandbox.',
    triggers: {
      commandTypes: ['node.add'],
      eventTypes: ['client.joined'],
    },
    content: 'scopeGroupId must point to a Group with enabled agentPolicy and allowNewNodes.',
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

const createConfiguredAiClient = (): OpenAiCompatibleClient => {
  const apiKey = process.env.SHUGU_AI_OPENAI_API_KEY?.trim();
  const model = process.env.SHUGU_AI_OPENAI_MODEL?.trim() || 'GPT5.5-low';
  const baseUrl = process.env.SHUGU_AI_OPENAI_BASE_URL?.trim() || 'https://code.b886.top/v1';
  if (!apiKey) return createNoopAiClient();
  return createOpenAiCompatibleClient({
    apiKey,
    model,
    baseUrl,
  });
};

@Module({
  imports: [SemanticModule],
  providers: [
    { provide: AI_SKILL_REGISTRY, useFactory: () => createAgentSkillRegistry({ skills: defaultSkills }) },
    { provide: AI_CHAT_CLIENT, useFactory: createConfiguredAiClient },
    {
      provide: AiOrchestratorService,
      inject: [SemanticGraphAuthorityService, AI_CHAT_CLIENT, AI_SKILL_REGISTRY],
      useFactory: (
        semanticAuthority: SemanticGraphAuthorityService,
        chatClient: OpenAiCompatibleClient,
        skillRegistry: AgentSkillRegistry
      ) => new AiOrchestratorService(semanticAuthority, chatClient, skillRegistry),
    },
  ],
  exports: [AiOrchestratorService],
})
export class AiModule {}
