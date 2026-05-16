/**
 * Purpose: Verify the persistent AI orchestrator turns environment events into scoped semantic commands.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentSkillRegistry } from '@shugu/ai-core';

import { AiOrchestratorService } from './ai-orchestrator.service.js';

const skillRegistry = createAgentSkillRegistry({
  skills: [
    {
      id: 'node.display-breathing',
      title: 'Display Breathing Node',
      summary: 'Controls display breathing visuals through bounded params.',
      triggers: {
        nodeTypes: ['display-breathing'],
        commandTypes: ['node.params.update'],
        eventTypes: ['client.joined', 'client.text.final'],
      },
      content: 'Full display breathing guidance.',
    },
    {
      id: 'command.node-add',
      title: 'Scoped Node Add',
      summary: 'Explains scoped node.add in an AI Space sandbox.',
      triggers: {
        commandTypes: ['node.add'],
        eventTypes: ['client.joined'],
      },
      content: 'Full scoped node.add guidance.',
    },
  ],
});

test('orchestrator emits semantic commands for joined and text events through the authority bus', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const authority = {
    getSnapshot: () => ({
      revision: 11,
      nodes: [
        {
          id: 'display:breath',
          type: 'display-breathing',
          params: { intensity: 0.3, breathRate: 1 },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [
        {
          type: 'display-breathing',
          label: 'Display Breathing',
          category: 'Effects',
          ports: { inputs: [], outputs: [] },
          params: [],
          aiSummary: {
            type: 'display-breathing',
            label: 'Display Breathing',
            version: '1.0.0',
            category: 'Effects',
            description: 'Controls a display breathing visual.',
            platforms: ['display'],
            sideEffects: 'remote-control',
            permissions: ['control:send'],
            ports: { inputs: [], outputs: [] },
            params: [],
            compatibility: [],
            examples: [],
            risks: [],
            repairHints: [],
          },
        },
      ],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.add', 'node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.add', 'node.params.update'],
            eventBindings: ['client.joined', 'client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 11,
        appliedRevision: 12,
        rollbackToken: 'rollback:11',
        audit: {
          id: 'audit:11',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 11,
          appliedRevision: 12,
          rollbackToken: 'rollback:11',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const prompts: string[] = [];
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      const { messages } = input;
      const prompt = messages.map((message) => message.content).join('\n');
      prompts.push(prompt);
      if (prompt.includes('"type":"client.joined"')) {
        return {
          raw: { ok: true },
          content:
            '{"id":"turn:join","summary":"welcome","commands":[{"type":"node.add","scopeGroupId":"ai-space:agent","node":{"id":"agent:greeting","type":"display-breathing","position":{"x":20,"y":0},"config":{"intensity":0.5,"breathRate":1.2},"inputValues":{},"outputValues":{}}}]}',
          parsed: {
            id: 'turn:join',
            summary: 'welcome',
            commands: [
              {
                type: 'node.add',
                scopeGroupId: 'ai-space:agent',
                node: {
                  id: 'agent:greeting',
                  type: 'display-breathing',
                  position: { x: 20, y: 0 },
                  config: { intensity: 0.5, breathRate: 1.2 },
                  inputValues: {},
                  outputValues: {},
                },
              },
            ],
          },
          request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
        };
      }

      return {
        raw: { ok: true },
        content:
          '{"id":"turn:text","summary":"adjust","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:agent","nodeId":"display:breath","params":{"intensity":0.7}}]}',
        parsed: {
          id: 'turn:text',
          summary: 'adjust',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:agent',
              nodeId: 'display:breath',
              params: { intensity: 0.7 },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const joined = await orchestrator.handleEnvironmentEvent({
    type: 'client.joined',
    clientId: 'client-1',
    groupId: 'ai-space:agent',
    message: 'hello',
  });
  assert.equal(joined.turns[0]?.plan?.commands.length, 1);
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].command.type, 'node.add');
  assert.equal(dispatches[0].dryRun, true);
  assert.equal(dispatches[0].command.scopeGroupId, 'ai-space:agent');
  assert.equal(dispatches[1].command.type, 'node.add');
  assert.equal(dispatches[1].dryRun, false);

  const text = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'ai-space:agent',
    text: 'make it warmer',
  });
  assert.equal(text.turns[0]?.plan?.commands[0]?.type, 'node.params.update');
  assert.equal(dispatches.length, 4);
  assert.equal(dispatches[2].command.type, 'node.params.update');
  assert.equal(dispatches[2].dryRun, true);
  assert.equal(dispatches[3].command.type, 'node.params.update');
  assert.equal(dispatches[3].dryRun, false);
  assert.equal(dispatches[3].command.scopeGroupId, 'ai-space:agent');
  assert.equal(
    prompts.some((prompt) => prompt.includes('Display Breathing Node')),
    true
  );
  assert.equal(
    prompts.some((prompt) => prompt.includes('client.joined')),
    true
  );
  assert.equal(
    prompts.some((prompt) => prompt.includes('client.text.final')),
    true
  );
});

test('orchestrator targets only enabled AI spaces whose interface binds the incoming event', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 12,
      nodes: [
        {
          id: 'display:breath',
          type: 'display-breathing',
          params: { intensity: 0.3, breathRate: 1 },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:enabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Enabled AI Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
        {
          id: 'group:ordinary',
          parentId: null,
          kind: 'group',
          name: 'Ordinary Group',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
        {
          id: 'ai-space:disabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Disabled AI Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: false,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 12,
        appliedRevision: 13,
        rollbackToken: 'rollback:12',
        audit: {
          id: 'audit:12',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 12,
          appliedRevision: 13,
          rollbackToken: 'rollback:12',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      return {
        raw: { ok: true },
        content:
          '{"id":"turn:join","summary":"welcome","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:enabled","nodeId":"display:breath","params":{"intensity":0.5}}]}',
        parsed: {
          id: 'turn:join',
          summary: 'welcome',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:enabled',
              nodeId: 'display:breath',
              params: { intensity: 0.5 },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.joined',
    clientId: 'client-1',
    groupId: 'group:not-the-target',
    message: 'hello',
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].includes('"targetSpaceId":"ai-space:enabled"'), true);
  assert.equal(prompts[0].includes('group:ordinary'), false);
  assert.equal(prompts[0].includes('ai-space:disabled'), false);
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0]?.targetSpaceId, 'ai-space:enabled');
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].dryRun, true);
  assert.equal(dispatches[1].dryRun, false);
});

test('orchestrator stays silent when no AI space binds the event', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 13,
      nodes: [],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:enabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Enabled AI Space',
          nodeIds: [],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: [], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: [],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 13,
        appliedRevision: 14,
        rollbackToken: 'rollback:13',
        audit: {
          id: 'audit:13',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 13,
          appliedRevision: 14,
          rollbackToken: 'rollback:13',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => {
      prompts.push('called');
      return {
        raw: { ok: true },
        content: '',
        parsed: null,
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'display.ready',
    displayId: 'display-1',
  });

  assert.equal(prompts.length, 0);
  assert.equal(dispatches.length, 0);
  assert.equal(result.turns.length, 0);
});
